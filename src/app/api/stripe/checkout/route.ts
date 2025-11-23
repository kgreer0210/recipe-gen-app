import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const priceId = process.env.STRIPE_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        { error: 'Stripe price ID is not configured' },
        { status: 500 }
      );
    }

    // Check for existing customer ID in subscriptions table
    // Although we created the table, it might be empty for new users.
    // For simplicity, we'll let Stripe handle customer creation or look it up if we stored it.
    // But wait, we need to store the stripe_customer_id to map webhooks back.
    
    // Ideally we should check if we already have a customer ID for this user.
    // Since I haven't implemented a way to store it on signup, I'll check my subscriptions table.
    
    const { data: subscription } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .single();

    let customerId = subscription?.stripe_customer_id;

    // If we don't have a customer ID, create one in Stripe or let checkout create one?
    // Letting checkout create one is easier, but we need to know it later.
    // Better to creating a customer session if we want to save cards etc, but for simple checkout:
    // We can pass `customer_email` to prefill it. 
    // If we want to link the future webhook events to this user, we can pass metadata.

    const session = await stripe.checkout.sessions.create({
      customer: customerId, // If null, Stripe creates a new one. 
      // If we don't provide customer, we should at least provide email if we have it.
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${request.headers.get('origin')}/?success=true`,
      cancel_url: `${request.headers.get('origin')}/pricing?canceled=true`,
      metadata: {
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
        }
      }
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

