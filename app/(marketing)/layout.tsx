import { getSessionUserId } from '@/lib/auth'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'
import ContactButton from '@/components/ContactButton'

/** Marketing route group — only `/` lives here, so this chrome never leaks to
 *  the auth pages (`/login`, `/register`), the `/drive` app, or the public
 *  `/s/[code]` share subtree (each has its own layout). Server component: we
 *  peek at the session cookie once to decide whether the nav shows a signup
 *  CTA or an "enter drive" button, then render the (fully static) page. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const signedIn = !!getSessionUserId()
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <MarketingNav signedIn={signedIn} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      <ContactButton variant="fab" />
    </div>
  )
}
