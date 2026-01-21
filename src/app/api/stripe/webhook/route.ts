import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import Stripe from 'stripe';

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  let event: Stripe.Event;

  try {
    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      return new NextResponse('Webhook Error: Missing signature or secret', { status: 400 });
    }
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Skip if no subscription (expired session, failed payment, etc.)
    if (!session.subscription) {
      console.log('Skipping checkout.session.completed: no subscription');
      return new NextResponse(null, { status: 200 });
    }

    // Retrieve the subscription details from Stripe
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );

    // We passed user_id in metadata
    const userId = session.metadata?.user_id;

    if (userId) {
      // Determine plan_key from price_id or metadata
      const priceId = subscription.items.data[0].price.id;
      const planFromMetadata = session.metadata?.plan || subscription.metadata?.plan;
      
      // Map price_id to plan_key (fallback to metadata, then default to plus for legacy)
      let planKey: string | undefined;
      if (planFromMetadata === 'pro' || planFromMetadata === 'plus') {
        planKey = planFromMetadata;
      } else {
        // Try to infer from price_id patterns (you can customize this)
        // For now, default to plus for backward compatibility
        planKey = 'plus';
      }

      // Upsert subscription data
      const { error } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          price_id: priceId,
          plan_key: planKey,
          updated_at: new Date().toISOString(),
        });

        if (error) {
            console.error('Error updating subscription:', error);
            return new NextResponse('Database Error', { status: 500 });
        }
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    
    // We need to find the user by stripe_customer_id if we don't have user_id in metadata of subscription
    // But we attached metadata to subscription in checkout.
    
    // If metadata is missing, we might need to query by customer_id
    let userId = subscription.metadata?.user_id;

    if (!userId) {
        const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('user_id')
            .eq('stripe_customer_id', subscription.customer as string)
            .single();
        
        if (existingSub) {
            userId = existingSub.user_id;
        }
    }

    if (userId) {
        const priceId = subscription.items.data[0].price.id;
        const planFromMetadata = subscription.metadata?.plan;
        
        // Determine plan_key (try metadata first, then infer from price_id)
        let planKey: string | undefined;
        if (planFromMetadata === 'pro' || planFromMetadata === 'plus') {
          planKey = planFromMetadata;
        } else {
          // Try to infer from existing subscription or default to plus
          const { data: existing } = await supabase
            .from('subscriptions')
            .select('plan_key')
            .eq('stripe_subscription_id', subscription.id)
            .single();
          planKey = existing?.plan_key || 'plus';
        }

        const { error } = await supabase
            .from('subscriptions')
            .update({
                status: subscription.status,
                price_id: priceId,
                plan_key: planKey,
                updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscription.id);
            
        if (error) {
            console.error('Error updating subscription:', error);
            return new NextResponse('Database Error', { status: 500 });
        }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    
    const { error } = await supabase
        .from('subscriptions')
        .update({
            status: subscription.status,
            updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id);
        
    if (error) {
        console.error('Error updating subscription:', error);
        return new NextResponse('Database Error', { status: 500 });
    }
  }

  return new NextResponse(null, { status: 200 });
}

