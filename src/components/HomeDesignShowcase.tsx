import Link from "next/link";
import { ArrowRight, Leaf } from "lucide-react";

export default function HomeDesignShowcase({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="home-showcase">
      <section className="market-concept">
        <div className="market-hero">
          <div className="market-copy">
            <div className="market-stamp"><Leaf size={16} /> Invite only</div>
            <h1>Good food,<br /><span>less figuring.</span></h1>
            <p>Mise AI is our private kitchen helper. It writes recipes from your cravings and pantry, plans the week, and builds one tidy grocery list.</p>
            <div className="hero-actions">
              {signedIn ? (
                <Link href="/generator" className="button button--tomato">Let&apos;s make dinner <ArrowRight size={18} /></Link>
              ) : (
                <Link href="/login" className="button button--tomato">Sign in <ArrowRight size={18} /></Link>
              )}
              <span className="market-note">
                <b>Invite only</b>
                <small>New accounts start from an invite email</small>
              </span>
            </div>
          </div>
          <div className="market-plate" aria-label="Illustration of a fresh dinner bowl">
            <span className="market-plate__leaf">🌿</span>
            <span className="market-plate__bowl">🍲</span>
            <span className="market-plate__tomato">tomato<br />to table</span>
          </div>
        </div>
      </section>
    </div>
  );
}
