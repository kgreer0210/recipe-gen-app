import Link from "next/link";
import { ArrowRight, CalendarDays, Leaf, ShoppingBasket, Sparkles } from "lucide-react";

const features = [
  { icon: Sparkles, title: "Dream it up", text: "Recipes made for your tastes, time, and pantry." },
  { icon: CalendarDays, title: "Plan the week", text: "A flexible meal plan that fits around real life." },
  { icon: ShoppingBasket, title: "Shop once", text: "One tidy grocery list, automatically organized." },
];

export default function HomeDesignShowcase() {
  return (
    <div className="home-showcase">
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
    </div>
  );
}
