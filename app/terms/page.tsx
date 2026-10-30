import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/site';
import LegalPage, { H2 } from '@/components/LegalPage';
import { CONTACT_EMAIL, mailto } from '@/lib/contact';

export const metadata: Metadata = pageMetadata({
  title: 'Terms',
  description: 'The terms for couples booking GlanceCam and guests using it.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p className="mt-6">
        These terms cover GlanceCam, a browser-based wedding guest camera provided by Golden Glance
        Studio (“we”, “us”) of Toronto, Ontario. By booking GlanceCam (couples) or sending a capture
        (guests) you agree to them. Your booking contract with us takes priority if it says
        something different.
      </p>

      <H2>The service</H2>
      <p>
        Guests scan a QR code and capture photos, films, boomerangs or voice notes in their phone’s
        browser. Captures appear in the couple’s private portal and, depending on the package, a
        shared gallery and a live slideshow. Features and how long the gallery stays open depend on
        the package booked, as described on our{' '}
        <Link href="/pricing" className="underline underline-offset-2">pricing page</Link>.
      </p>

      <H2>Booking and payment</H2>
      <p>
        A 25% deposit reserves your date. The balance is invoiced through ShootProof. Cancellation,
        rescheduling and refund terms are set out in your booking contract.
      </p>

      <H2>For couples</H2>
      <ul className="list-disc pl-5 space-y-2">
        <li>Keep your portal link private; anyone holding it can manage your event.</li>
        <li>
          Let your guests know GlanceCam is in use (the table card does this) and respect anyone who
          asks not to be photographed or asks for a capture to be hidden.
        </li>
        <li>
          Download your ZIP before your originals are deleted. The deletion date is shown in your
          portal and in our <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>.
          Deletion is permanent, including our backup, and we cannot recover anything afterwards.
        </li>
      </ul>

      <H2>For guests: your captures</H2>
      <p>
        You keep the copyright in what you capture. By sending it, you give the couple and us a
        non-exclusive, royalty-free licence to store it, show it in the event’s portal, gallery and
        slideshow, and let the couple download and keep it for their personal use. We will not use
        your captures to promote our studio without the couple’s written permission. Only send
        captures you have the right to share and that the people in them would be comfortable
        with.
      </p>

      <H2>Acceptable use</H2>
      <p>
        Don’t upload anything unlawful, hateful, sexually explicit or that invades someone’s
        privacy, and don’t try to disrupt, overload or break into the service. The couple can hide
        any capture, and we may remove content or block access that breaks these rules.
      </p>

      <H2>Availability</H2>
      <p>
        We work hard to make the evening run smoothly, and captures wait on the guest’s phone until
        the venue’s signal allows them to send. GlanceCam still depends on guests’ phones, browsers
        and the venue’s internet, which we don’t control, so we can’t promise that every capture
        will be made or delivered. GlanceCam is a fun extra, not a replacement for a professional
        photographer.
      </p>

      <H2>Liability</H2>
      <p>
        To the extent the law allows, the service is provided “as is”, and our total liability for
        any claim about GlanceCam is limited to the fees you paid us for it. We are not responsible
        for content uploaded by guests. Nothing in these terms limits rights you have under Ontario
        consumer protection law.
      </p>

      <H2>General</H2>
      <p>
        These terms are governed by the laws of Ontario and the federal laws of Canada that apply
        there. We may update them and will post changes here with a new date; the version in place
        when you booked applies to your event. Questions:{' '}
        <a href={mailto('GlanceCam terms')} className="underline underline-offset-2">{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
