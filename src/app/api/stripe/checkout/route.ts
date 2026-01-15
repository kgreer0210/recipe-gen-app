import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper';

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { interval = 'month', plan = 'plus' } = await request.json();

    // Map plan to price IDs
    // Environment variables should be:
    // STRIPE_PLUS_PRICE_ID, STRIPE_PLUS_ANNUAL_PRICE_ID
    // STRIPE_PRO_PRICE_ID, STRIPE_PRO_ANNUAL_PRICE_ID
    // Legacy: STRIPE_PRICE_ID, STRIPE_ANNUAL_PRICE_ID (treated as Plus)
    let priceId: string | undefined;

    if (plan === 'pro') {
      priceId = interval === 'year'
        ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID
        : process.env.STRIPE_PRO_PRICE_ID;
    } else {
      // Default to Plus
      priceId = interval === 'year'
        ? process.env.STRIPE_PLUS_ANNUAL_PRICE_ID || process.env.STRIPE_ANNUAL_PRICE_ID
        : process.env.STRIPE_PLUS_PRICE_ID || process.env.STRIPE_PRICE_ID;
    }

    if (!priceId) {
      return NextResponse.json(
        { error: 'Stripe price ID is not configured for this plan' },
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

    // Use origin header for web, fallback to app URL for mobile
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://www.mise-ai.app';

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
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata: {
        user_id: user.id,
        plan: plan,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan: plan,
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

