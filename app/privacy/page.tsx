import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';
import LegalPage, { H2 } from '@/components/LegalPage';
import { CONTACT_EMAIL, mailto } from '@/lib/contact';
import { TIER_LIST } from '@/lib/tiers';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy policy',
  description: 'What GlanceCam collects at your wedding, who sees it, and when it is deleted.',
  path: '/privacy',
});

function days(n: number): string {
  return n >= 365 ? `${Math.round(n / 30.4)} months` : `${n} days`;
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p className="mt-6">
        GlanceCam is a wedding guest camera run by Golden Glance Studio in Toronto, Ontario. This
        policy explains what personal information we collect when couples book GlanceCam and
        when guests use it, why, who can see it, and when we delete it. We follow Canada’s{' '}
        <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA).
      </p>

      <H2>What we collect</H2>
      <p>
        <strong>From guests:</strong> the photos, films, boomerangs and voice notes you choose to
        send; an optional first name you type so the couple knows who sent what; and any comments
        you post in the gallery. Guests do not create accounts, and we never ask for an email,
        phone number or contacts. Photos picked from your library are re-saved before upload, which
        strips location (GPS) and other camera details.
      </p>
      <p className="mt-3">
        <strong>From couples:</strong> your names, wedding date, welcome message and the contact and
        billing details you share with us by email and through ShootProof to book.
      </p>
      <p className="mt-3">
        <strong>Automatically:</strong> your IP address and basic request details, used briefly to
        block spam and abuse and kept in our hosting provider’s logs for a short period. We use no
        advertising cookies. Your phone stores your name and any captures still waiting to send,
        only on your device, until they upload.
      </p>

      <H2 id="analytics">Website analytics (optional)</H2>
      <p>
        On our public pages only (home, pricing, terms and this page) we ask whether we may use
        Google Analytics. If you accept, Google sets cookies that tell us how visitors find and use
        those pages, such as pages viewed, approximate location, device type and the site you came
        from. If you decline, or never answer, Google Analytics is not loaded at all. It never runs on
        wedding cameras, galleries, slideshows or couple portals, so guests at a wedding are never
        tracked. You can change your choice at any time with “cookie settings” at the bottom of these
        pages. Google processes this data in the United States under its own privacy policy.
      </p>

      <H2>How we use it</H2>
      <p>
        Only to run the event: to show captures in the couple’s private portal and the event’s
        shared gallery and slideshow, to let the couple download them, to keep the service secure,
        and to communicate with the couple about their booking. We never sell personal information
        and never use guest captures in our own marketing without written permission from the
        couple.
      </p>

      <H2>Who can see your captures</H2>
      <p>
        The couple sees everything sent to their event and can hide any capture. Anyone the couple
        or a guest shares the gallery link with can view approved captures while the gallery is
        open. Media files are stored at hard-to-guess web addresses, so anyone holding such an
        address can open that file. Our studio staff access event content only to provide support or
        when the law requires it.
      </p>

      <H2>Where it is stored</H2>
      <p>
        We use trusted service providers bound by confidentiality and security obligations:
        Supabase (database and media storage, hosted in Canada), Vercel (website hosting and our
        off-site backup copy, hosted in Montréal, with a global network that delivers pages),
        ShootProof (invoices and payment) and, only if you accept it, Google Analytics. Some of these providers are U.S. companies, so your
        information may be accessible to authorities in the United States under its laws.
      </p>

      <H2>How long we keep it</H2>
      <p>
        Captures, names and comments are permanently deleted, including our backup copy, on a
        schedule tied to the package the couple booked, counted from the wedding date:
      </p>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-[10px] uppercase tracking-widest text-ink/70">
          <tr>
            <th scope="col" className="py-2 pr-4 font-normal">package</th>
            <th scope="col" className="py-2 pr-4 font-normal">shared gallery open</th>
            <th scope="col" className="py-2 font-normal">everything deleted</th>
          </tr>
        </thead>
        <tbody>
          {TIER_LIST.map((t) => (
            <tr key={t.id} className="border-t border-warm-gray-light">
              <td className="py-2 pr-4">{t.label}</td>
              <td className="py-2 pr-4">{days(t.features.galleryDays)}</td>
              <td className="py-2">{days(t.features.retentionDays)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4">
        The couple’s portal shows the deletion date and reminds them to download their ZIP first.
        After deletion we keep only a minimal booking record (names, date and package) and the
        billing records the law requires us to keep.
      </p>

      <H2>Your choices</H2>
      <p>
        Sending a capture is always optional, and so is your name. If you sent something you’d like
        removed, ask the couple to hide it, or email us with the event and a description and we
        will delete it. You can ask us what personal information we hold about you, ask us to
        correct it, or withdraw your consent, at{' '}
        <a href={mailto('Privacy request')} className="underline underline-offset-2">{CONTACT_EMAIL}</a>.
        We reply within 30 days. GlanceCam is meant for wedding guests and is not directed at
        children; parents decide whether a child takes part.
      </p>

      <H2>Security</H2>
      <p>
        Everything travels over encrypted connections. Guests cannot read or change other events,
        the couple’s portal uses a private link, uploads are checked and rate-limited, and only our
        server can write to the database. No system is perfectly secure; if a breach ever creates a
        real risk of significant harm, we will notify the people affected and the Privacy
        Commissioner of Canada as the law requires.
      </p>

      <H2>Questions or complaints</H2>
      <p>
        Our privacy contact is Golden Glance Studio,{' '}
        <a href={mailto('Privacy question')} className="underline underline-offset-2">{CONTACT_EMAIL}</a>.
        If we can’t resolve your concern you may contact the Office of the Privacy Commissioner of
        Canada (priv.gc.ca). We will post any changes to this policy here with a new date.
      </p>
    </LegalPage>
  );
}
