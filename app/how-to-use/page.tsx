import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to use Central Ops Travel",
  description: "A written and video guide to requesting, viewing, joining, and changing ShipHero customer visits.",
};

const STEPS = [
  {
    number: "01",
    title: "Sign in with ShipHero",
    copy: "Use your verified @shiphero.com Google account. A ShipHero email address is required to submit requests, open Map View, or join a visit.",
  },
  {
    number: "02",
    title: "Submit the visit",
    copy: "Open Requests and provide the account, customer link, dates, date confidence, warehouse address, point of contact, and warehouse start time.",
  },
  {
    number: "03",
    title: "Complete onboarding readiness",
    copy: "For an Onboarding visit, answer every vetting question. A No answer is allowed and helps the team see what still needs attention.",
  },
  {
    number: "04",
    title: "Wait for approval and assignment",
    copy: "After submission, the request is reviewed and assigned. Approved engagements appear in Upcoming Travel and on the shared CS Onsite Google Calendar.",
  },
  {
    number: "05",
    title: "View or join on the map",
    copy: "Open Map View to see when and where engagements are happening. Choose Join and shadow to be added to the Calendar invitation.",
  },
  {
    number: "06",
    title: "Handle changes",
    copy: "The original requester can ask to reschedule or cancel. The change goes through approval again before Calendar and attendee updates are applied.",
  },
] as const;

const FAQS = [
  ["Who can use Central Ops Travel?", "Only people signed in with a verified @shiphero.com Google account can submit requests, view the employee map, or join a visit. The basic upcoming travel list is public and intentionally limited."],
  ["What is required to submit a visit?", "Provide the visit type, date confidence, account name, customer link, warehouse address, dates, point of contact, contact information, and warehouse start time."],
  ["Do all onboarding readiness answers have to be Yes?", "No. Every question must be answered, but No is a valid response. The answers help reviewers understand readiness and outstanding work."],
  ["What happens after I submit?", "The request enters the approval queue. An administrator reviews it and assigns a traveler. You do not need to manage that step."],
  ["Where do approved engagements appear?", "They appear in Upcoming Travel, Map View, and the shared CS Onsite Google Calendar. The assigned traveler receives the Calendar invitation."],
  ["How do I join or shadow a trip?", "Sign in, open Map View, select the engagement, and choose Join and shadow. You will be added to the Calendar event as an attendee."],
  ["Can I cancel or reschedule a visit?", "Yes. The original requester can request a cancellation or new dates. The assigned traveler or an administrator must approve the change before the Calendar event is updated."],
  ["Will the right people receive Calendar updates?", "Yes. Approved assignments, shadowing requests, reschedules, and cancellations update the shared Calendar event and its attendees."],
] as const;

export default function HowToUsePage() {
  return (
    <main className="guide-shell">
      <header className="guide-hero">
        <nav className="guide-nav" aria-label="Travel workspace">
          <Link className="guide-brand" href="/">Central Ops Travel</Link>
          <div>
            <Link href="/">Upcoming travel</Link>
            <Link href="/?view=submit">Requests</Link>
            <Link href="/map">Map view</Link>
            <Link className="active" href="/how-to-use" aria-current="page">How to use</Link>
          </div>
        </nav>
        <div className="guide-hero-grid">
          <div>
            <p className="eyebrow">Central Ops Travel guide</p>
            <h1>Plan and join customer visits</h1>
            <p>Submit a complete request, follow approved engagements, and keep the shared Calendar accurate.</p>
            <div className="guide-actions">
              <Link className="btn-primary" href="/?view=submit">Submit a request</Link>
              <a className="guide-secondary-link" href="#written-guide">Read the guide</a>
            </div>
          </div>
          <aside className="access-callout" aria-label="Access requirement">
            <span>Access requirement</span>
            <strong>A verified ShipHero email address is required.</strong>
            <p>Sign in with your @shiphero.com Google account to request, map, join, reschedule, or cancel a visit.</p>
          </aside>
        </div>
      </header>

      <div className="guide-content">
        <section className="guide-video-section" aria-labelledby="video-heading">
          <div className="guide-section-heading">
            <div><p className="eyebrow">Video walkthrough</p><h2 id="video-heading">Central Ops Travel in under two minutes</h2></div>
            <span>Voiceover and English captions included</span>
          </div>
          <div className="guide-video-frame">
            <video controls preload="metadata" poster="/tutorial/central-ops-travel-poster.jpg">
              <source src="/tutorial/central-ops-travel.mp4" type="video/mp4" />
              <track kind="captions" src="/tutorial/central-ops-travel.vtt" srcLang="en" label="English" default />
              Your browser does not support the tutorial video. Use the written guide below.
            </video>
          </div>
          <details className="video-transcript">
            <summary>Read the video transcript</summary>
            <div>
              <p>Central Ops Travel helps verified ShipHero employees coordinate customer onsite visits. Sign in with your ShipHero Google account to submit requests, view the map, or join a trip.</p>
              <p>Open Requests, choose the visit type and date confidence, then add the customer name, customer link, warehouse address, dates, point of contact, and warehouse start time.</p>
              <p>For an onboarding onsite, answer every readiness question. A No answer is allowed. The checklist helps the team understand what still needs attention before the visit.</p>
              <p>Submit the request. The approval and assignment steps happen behind the scenes. Once approved, the engagement appears in the upcoming travel list and on the shared CS Onsite Google Calendar.</p>
              <p>Use Map View to see when and where approved engagements are happening. Open a visit and choose Join and shadow. The Calendar invitation updates with the right people.</p>
              <p>If plans change, the original requester can request new dates or cancellation. Those changes return for approval, then the Calendar and attendees update automatically.</p>
            </div>
          </details>
        </section>

        <section id="written-guide" className="written-guide" aria-labelledby="written-guide-heading">
          <div className="guide-section-heading">
            <div><p className="eyebrow">Written documentation</p><h2 id="written-guide-heading">How the workflow works</h2></div>
            <span>Six steps from request to Calendar</span>
          </div>
          <ol className="guide-steps">
            {STEPS.map((step) => (
              <li key={step.number}>
                <span>{step.number}</span>
                <div><h3>{step.title}</h3><p>{step.copy}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="guide-flow" aria-labelledby="calendar-flow-heading">
          <div><p className="eyebrow">What happens automatically</p><h2 id="calendar-flow-heading">One request, one shared workflow</h2></div>
          <div className="guide-flow-grid">
            <article><span>1</span><h3>Request saved</h3><p>Your verified identity and visit details stay attached to the request.</p></article>
            <article><span>2</span><h3>Visit approved</h3><p>An administrator assigns the traveler and schedules the engagement.</p></article>
            <article><span>3</span><h3>Calendar updated</h3><p>The shared CS Onsite Calendar invites the assigned traveler and approved shadowers.</p></article>
            <article><span>4</span><h3>Changes reviewed</h3><p>Reschedules and cancellations return for approval before attendee updates are sent.</p></article>
          </div>
        </section>

        <section className="guide-faq" aria-labelledby="faq-heading">
          <div className="guide-section-heading"><div><p className="eyebrow">Frequently asked questions</p><h2 id="faq-heading">Answers before you start</h2></div></div>
          <div className="faq-list">
            {FAQS.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section className="guide-cta" aria-label="Start a travel request">
          <div><p className="eyebrow">Ready to plan a visit?</p><h2>Start with the customer details.</h2><p>Have the warehouse address, point of contact, dates, and onboarding readiness information ready.</p></div>
          <Link className="btn-primary" href="/?view=submit">Submit a request</Link>
        </section>
      </div>
    </main>
  );
}
