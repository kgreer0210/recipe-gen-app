"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChefHat,
  Clock3,
  CookingPot,
  Leaf,
  ShoppingBasket,
  Sparkles,
  Utensils,
} from "lucide-react";

const concepts = [
  { name: "The Restaurant", note: "Editorial & immersive" },
  { name: "Fresh Market", note: "Warm & approachable" },
  { name: "Kitchen OS", note: "Bold & product-led" },
];

export default function HomeDesignShowcase() {
  const [active, setActive] = useState<number>(1);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="home-showcase home-showcase--market">
      <div className="concept-picker" aria-label="Choose a homepage concept">
        <div className="concept-picker__intro">
          <span>Explore directions</span>
          <strong>Choose your Mise</strong>
        </div>
        <div className="concept-picker__tabs" role="tablist">
          {concepts.map((concept, index) => (
            <button
              key={concept.name}
              type="button"
              role="tab"
              id={`concept-tab-${index}`}
              aria-controls={`concept-panel-${index}`}
              aria-selected={active === index}
              onClick={() => setActive(index)}
              className={active === index ? "is-active" : ""}
            >
              <b>0{index + 1}</b>
              <span>{concept.name}<small>{concept.note}</small></span>
            </button>
          ))}
        </div>
      </div>

      <div
        id={`concept-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`concept-tab-${active}`}
        tabIndex={0}
        className="concept-stage"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              shouldReduceMotion
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: -12 }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.32, ease: "easeOut" }
            }
          >
            {active === 0 && <RestaurantConcept />}
            {active === 1 && <MarketConcept />}
            {active === 2 && <OsConcept />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function RestaurantConcept() {
  return (
    <section className="restaurant-concept">
      <div className="restaurant-concept__photo" aria-hidden="true" />
      <div className="restaurant-concept__shade" aria-hidden="true" />
      <div className="restaurant-concept__topline">
        <span><Utensils size={15} /> Your table is ready</span>
        <span>Personal menus · thoughtfully made</span>
      </div>
      <div className="restaurant-concept__copy">
        <p className="eyebrow">AI-powered kitchen intelligence</p>
        <h1>Make dinner feel<br />like an <em>occasion.</em></h1>
        <p className="restaurant-concept__lede">
          A personal chef for real life. Tell us what you love, what you have,
          and how much time you&apos;ve got—we&apos;ll take care of the rest.
        </p>
        <div className="hero-actions">
          <Link href="/generator" className="button button--cream">Create tonight&apos;s menu <ArrowRight size={18} /></Link>
          <Link href="/about" className="text-link">Discover how it works <span>↗</span></Link>
        </div>
      </div>
      <div className="restaurant-concept__card">
        <span className="card-kicker">Tonight&apos;s suggestion</span>
        <h2>Brown butter<br />sage gnocchi</h2>
        <div className="card-meta"><span><Clock3 size={14} /> 25 min</span><span><Leaf size={14} /> Vegetarian</span></div>
        <Link href="/generator">Make it yours <ArrowRight size={15} /></Link>
      </div>
    </section>
  );
}

function MarketConcept() {
  const features = [
    { icon: Sparkles, title: "Dream it up", text: "Recipes made for your tastes, time, and pantry." },
    { icon: CalendarDays, title: "Plan the week", text: "A flexible meal plan that fits around real life." },
    { icon: ShoppingBasket, title: "Shop once", text: "One tidy grocery list, automatically organized." },
  ];

  return (
    <section className="market-concept">
      <div className="market-hero">
        <div className="market-copy">
          <div className="market-stamp"><Leaf size={16} /> Made for everyday cooks</div>
          <h1>Good food,<br /><span>less figuring.</span></h1>
          <p>Mise turns your cravings and pantry staples into a week of meals you&apos;ll actually look forward to.</p>
          <div className="hero-actions">
            <Link href="/generator" className="button button--tomato">Let&apos;s make dinner <ArrowRight size={18} /></Link>
          <span className="market-note"><b>Made for your kitchen</b><small>Personal planning without the busywork</small></span>
          </div>
        </div>
        <div className="market-plate" aria-label="Illustration of a fresh dinner bowl">
          <span className="market-plate__leaf">🌿</span>
          <span className="market-plate__bowl">🍲</span>
          <span className="market-plate__tomato">tomato<br />to table</span>
        </div>
      </div>
      <div className="market-features">
        {features.map(({ icon: Icon, title, text }, index) => (
          <article key={title}>
            <span className="feature-number">0{index + 1}</span>
            <Icon size={25} />
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function OsConcept() {
  return (
    <section className="os-concept">
      <div className="os-orb os-orb--one" /><div className="os-orb os-orb--two" />
      <div className="os-copy">
        <div className="os-badge"><Sparkles size={14} /> Mise intelligence</div>
        <h1>Your entire kitchen,<br /><span>finally in sync.</span></h1>
        <p>One smart workspace that turns ideas into recipes, recipes into plans, and plans into one perfect grocery run.</p>
        <div className="hero-actions">
          <Link href="/generator" className="button button--lime">Start cooking free <ArrowRight size={18} /></Link>
          <span className="os-check"><Check size={16} /> No credit card</span>
        </div>
      </div>
      <div className="os-dashboard">
        <div className="os-dashboard__bar"><span><i /> <i /> <i /></span><b>My week</b><small>Synced just now</small></div>
        <div className="os-dashboard__body">
          <aside>
            <div className="os-logo"><ChefHat size={20} /></div>
            <i className="active" /><i /><i /><i />
          </aside>
          <div className="os-content">
            <div className="os-heading"><span><small>THIS WEEK</small><b>Dinner, handled.</b></span><span className="os-heading__action">+ Add meal</span></div>
            <div className="os-days">
              <article><small>MON · 24</small><span>🥗</span><b>Crispy tahini bowl</b><em>20 min</em></article>
              <article className="featured"><small>TUE · 25</small><span>🍝</span><b>Silky tomato pasta</b><em>30 min</em></article>
              <article><small>WED · 26</small><span>🌮</span><b>Chili-lime tacos</b><em>25 min</em></article>
            </div>
            <div className="os-progress"><CookingPot size={18} /><span><b>3 dinners planned</b><small>Your grocery list is ready</small></span><strong>18 items →</strong></div>
          </div>
        </div>
      </div>
    </section>
  );
}
