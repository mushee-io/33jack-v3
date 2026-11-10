import React, { Fragment, useEffect, useRef, useState } from "react";
import "./mainframe-hero.css";

const repository = "https://github.com/mushee-io/33jack-v3";
const contact = "contact@mushee.xyz";
const message = "Glad you stopped in. Good taste tends to find us. Now, what are we building?";
const videoSource = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260530_042513_df96a13b-6155-4f6e-8b93-c9dee66fba08.mp4";
const links = [
  { label: "Labs", href: "/app/amadeus" },
  { label: "Studio", href: repository + "#readme" },
  { label: "Roadmap", href: repository + "/blob/main/docs/ROADMAP-M1-M10.md" },
  { label: "GitHub", href: repository },
];
const actions = [
  { label: "Pitch us an idea", href: "mailto:" + contact + "?subject=33JACK%20project%20idea" },
  { label: "Come work here", href: "mailto:" + contact + "?subject=Working%20with%2033JACK" },
  { label: "Send a brief hello", href: "mailto:" + contact },
  { label: "See how we operate", href: "/app/amadeus" },
];

function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLength(text.length);
      return;
    }
    let index = 0;
    let interval: number;
    const delay = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setLength(++index);
        if (index >= text.length) window.clearInterval(interval);
      }, speed);
    }, startDelay);
    return () => {
      window.clearTimeout(delay);
      window.clearInterval(interval);
    };
  }, [text, speed, startDelay]);
  return { displayed: text.slice(0, length), done: length >= text.length };
}

function ScrubVideo() {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let previousX: number | undefined;
    let targetTime = 0;
    function seek() {
      if (!element.seeking && Math.abs(element.currentTime - targetTime) >= .01) {
        element.currentTime = targetTime;
      }
    }
    function move(x: number) {
      const delta = previousX === undefined ? 0 : x - previousX;
      previousX = x;
      if (!Number.isFinite(element.duration) || !delta) return;
      targetTime = Math.max(0, Math.min(element.duration, targetTime + delta / window.innerWidth * .8 * element.duration));
      seek();
    }
    const mouseMove = (event: MouseEvent) => move(event.clientX);
    const touchStart = (event: TouchEvent) => { previousX = event.touches[0]?.clientX; };
    const touchMove = (event: TouchEvent) => { if (event.touches.length === 1) move(event.touches[0].clientX); };
    window.addEventListener("mousemove", mouseMove);
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: true });
    element.addEventListener("seeked", seek);
    return () => {
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      element.removeEventListener("seeked", seek);
    };
  }, []);
  return (
    <video
      ref={video}
      className="mainframe-video pointer-events-none fixed inset-0 z-0 h-full w-full object-cover"
      src={videoSource}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
    />
  );
}

export default function MainframeHero() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const { displayed, done } = useTypewriter(message);

  function closeMenuOnEscape(event: React.KeyboardEvent) {
    if (event.key === "Escape" && menuOpen) {
      setMenuOpen(false);
      menuButton.current?.focus();
    }
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(contact);
      setCopyStatus("Email copied");
    } catch {
      setCopyStatus(contact);
    }
  }

  return (
    <div className="mainframe-page" onKeyDown={closeMenuOnEscape}>
      <ScrubVideo />
      <header className="fixed inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <a className="mainframe-logo flex items-center gap-3 text-[21px] tracking-tight sm:text-[26px]" href="/" aria-label="33JACK home">
          33JACK <span className="select-none text-[25px] sm:text-[30px]" aria-hidden="true">✳︎</span>
        </a>
        <nav className="mainframe-desktop-nav hidden text-[23px] md:block" aria-label="Main navigation">
          {links.map(({ label, href }, index) => (
            <Fragment key={label}>
              {index > 0 && ", "}
              <a className="transition-opacity hover:opacity-60" href={href}>{label}</a>
            </Fragment>
          ))}
        </nav>
        <a className="hidden text-[23px] underline underline-offset-2 transition-opacity hover:opacity-60 md:inline" href={"mailto:" + contact}>Get in touch</a>
        <button
          ref={menuButton}
          type="button"
          className="mainframe-menu-button md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mainframe-mobile-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span /><span /><span />
        </button>
      </header>
      <nav
        id="mainframe-mobile-menu"
        className="mainframe-mobile-menu fixed inset-0 z-[9] flex flex-col justify-center gap-8 px-8 text-[32px] font-medium md:hidden"
        data-open={menuOpen}
        aria-label="Mobile navigation"
        inert={!menuOpen}
      >
        {links.map(({ label, href }) => <a key={label} href={href}>{label}</a>)}
        <a className="underline underline-offset-2" href={"mailto:" + contact}>Get in touch</a>
      </nav>
      <main className="mainframe-content relative z-[1] flex flex-col justify-end overflow-hidden px-5 pb-12 sm:px-8 md:justify-center md:px-10 md:pb-0" inert={menuOpen}>
        <div className="relative z-10 max-w-xl">
          <h1 className="mainframe-intro pointer-events-none mb-5 select-none sm:mb-6">
            Hey there, meet A.R.I.A,<br />
            33JACK’s Adaptive Response Interface Agent
          </h1>
          <p className="mainframe-message mb-5 sm:mb-6" aria-label={message}>
            <span className="mainframe-message-spacer" aria-hidden="true">{message}</span>
            <span aria-hidden="true">{displayed}{!done && <span className="mainframe-cursor" />}</span>
          </p>
          <div className="mainframe-actions flex flex-wrap gap-y-1">
            {actions.map(({ label, href }) => <a className="mainframe-pill" key={label} href={href}>{label}</a>)}
            <button className="mainframe-pill mainframe-pill-outline" type="button" onClick={copyEmail} aria-label={"Copy email address " + contact}>
              <span>Reach us: <u>{contact}</u></span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
                <rect x="4" y="4" width="7" height="7" rx="1" />
                <path d="M2 8H1V1h7v1" />
              </svg>
            </button>
            <span className="mainframe-copy-status" role="status">{copyStatus}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
