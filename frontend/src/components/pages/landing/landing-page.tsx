'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { navigate } from '@/lib/router';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const FEATURES = [
  {
    kicker: 'Matters',
    title: 'One home for every case',
    body: 'Track status, deadlines, notes and documents for every matter — searchable and filterable across your whole firm.',
    meta: 'Practice-area tags · Full case timeline',
  },
  {
    kicker: 'Documents',
    title: 'Generate documents in minutes, not hours',
    body: "Pick a template, fill in a few blanks, and Lawmate creates a properly formatted document — synced straight to your firm's Google Drive.",
    meta: 'Google Drive-backed · Version history',
  },
  {
    kicker: 'Tasks',
    title: "See exactly what's due, and what's late",
    body: 'A drag-and-drop board for every case — assign work, leave comments, and get notified the moment something needs attention.',
    meta: 'Kanban board · Comments & watchers',
  },
  {
    kicker: 'Calendar',
    title: 'Never miss a court date',
    body: 'Track hearings, deadlines and meetings on one calendar, and push any event straight to Google Calendar.',
    meta: 'Court dates · Google Calendar sync',
  },
  {
    kicker: 'Invoicing',
    title: 'Bill properly, the first time',
    body: 'Generate invoices with VAT and withholding tax handled correctly, issue a formal Bill of Charges, and collect payment online via Paystack.',
    meta: 'VAT & WHT · Paystack payments',
  },
  {
    kicker: 'Reports',
    title: 'Know what happened on every case, every month',
    body: 'Generate an activity report for a client or period in one click — emailed to you or exported straight to Google Docs.',
    meta: 'Client & period reports · Google Docs export',
  },
];

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-5 before:content-['✓'] before:absolute before:left-0 before:text-primary">
      {children}
    </li>
  );
}

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [annualBilling, setAnnualBilling] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* ── Navigation ── */}
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="max-w-[1120px] mx-auto flex items-center gap-8 px-4 sm:px-8 py-4">
          <span
            className="flex items-center gap-2 text-xl font-semibold tracking-tight cursor-pointer mr-auto"
            onClick={() => navigate('/')}
          >
            <img src="/logo.svg" alt="" className="h-7 w-7" />
            Lawmate
          </span>

          <nav className="hidden md:flex items-center gap-8 text-sm">
            <button onClick={() => scrollToSection('features')} className="text-foreground/80 hover:text-primary transition-colors">
              Features
            </button>
            <button onClick={() => scrollToSection('impact')} className="text-foreground/80 hover:text-primary transition-colors">
              Impact
            </button>
            <button onClick={() => scrollToSection('pricing')} className="text-foreground/80 hover:text-primary transition-colors">
              Pricing
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => navigate('/login')}>Sign In</Button>
            <Button onClick={() => navigate('/register')}>Get Started</Button>
          </div>

          <button
            className="md:hidden -m-2 p-2 text-foreground"
            aria-label="Toggle menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-border bg-background overflow-hidden"
            >
              <div className="flex flex-col gap-1 p-4">
                <button onClick={() => scrollToSection('features')} className="text-left py-2 text-sm">Features</button>
                <button onClick={() => scrollToSection('impact')} className="text-left py-2 text-sm">Impact</button>
                <button onClick={() => scrollToSection('pricing')} className="text-left py-2 text-sm">Pricing</button>
                <div className="flex flex-col gap-2 pt-3 mt-2 border-t border-border">
                  <Button variant="secondary" className="w-full" onClick={() => navigate('/login')}>Sign In</Button>
                  <Button className="w-full" onClick={() => navigate('/register')}>Get Started</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        {/* ── Hero ── */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-center py-14 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-start gap-4"
          >
            <Badge variant="outline" className="whitespace-normal text-left">
              Built for Nigerian law firms
            </Badge>

            <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-semibold tracking-tight leading-[1.1] text-foreground">
              Keep every case, deadline and invoice in one place
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
              Lawmate helps Nigerian law firms track matters, generate documents, hit deadlines, and get paid — without spreadsheets, WhatsApp reminders, or chasing paper files.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button size="lg" onClick={() => navigate('/register')}>Start Your 30-Day Free Trial</Button>
              <Button size="lg" variant="secondary" onClick={() => scrollToSection('features')}>See How It Works</Button>
            </div>

            <div className="flex items-center gap-2 pt-6 mt-2 border-t border-border w-full text-xs uppercase tracking-wider text-muted-foreground">
              <span>30-day free trial</span>
              <span aria-hidden="true">·</span>
              <span>Full access</span>
              <span aria-hidden="true">·</span>
              <span>Cancel anytime</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="shadow-[0_3px_10px_rgba(0,0,0,0.08)]">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Active Matter</span>
                  <Badge>In Progress</Badge>
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">Zenith Bank v. Adekunle Holdings</p>
                  <p className="text-[12.5px] text-muted-foreground">Client: Zenith Bank Plc · LM/2026/014</p>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
                  <span>To Review · 3 tasks</span>
                  <span>Completed · 12 tasks</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">Review loan agreement</p>
                    <p className="text-[12.5px] text-muted-foreground">Due in 2 days</p>
                  </div>
                  <Badge variant="secondary">Due soon</Badge>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">Court date reminder</p>
                    <p className="text-[12.5px] text-muted-foreground">Hearing in 2 days · synced to calendar</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/register')}>Open →</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="py-16 sm:py-20 border-t border-border">
          <div className="max-w-xl mb-10">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">What you can do</span>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mt-1">Everything you already do, just faster</h2>
            <p className="text-muted-foreground mt-2">No new way of working to learn — Lawmate just takes the busywork out of running a practice.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardContent className="p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{f.kicker}</p>
                  <h3 className="text-lg font-semibold text-foreground mt-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.body}</p>
                  <p className="text-xs text-muted-foreground/80 mt-3">{f.meta}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Impact ── */}
        <section id="impact" className="py-16 sm:py-20 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">Built to be trusted with client work</span>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mt-1">Control who sees what, and know who did what</h2>
            <p className="text-muted-foreground mt-2 leading-relaxed">Lawmate gives every firm real access control and a full record of who did what — not just a login screen.</p>
            <ul className="flex flex-col gap-2 mt-4 text-sm">
              <CheckItem>
                <b className="text-foreground">Role-based access</b> — give teammates Admin, Member, or Viewer access, so juniors can work without touching billing or firm settings.
              </CheckItem>
              <CheckItem>
                <b className="text-foreground">Two-factor authentication</b> — turn on MFA for your whole firm, included on every plan.
              </CheckItem>
              <CheckItem>
                <b className="text-foreground">A full audit trail</b> — every sensitive action is logged with who did it and when.
              </CheckItem>
              <CheckItem>
                <b className="text-foreground">Multiple organisations, one login</b> — running more than one firm or branch? Switch between them without logging out.
              </CheckItem>
            </ul>
          </div>
          <Card>
            <CardContent className="p-6 sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">What firms are looking for</p>
              <p className="text-xl sm:text-2xl leading-snug text-foreground mt-2">
                Less time chasing paperwork and payments, more time on the actual legal work — that&rsquo;s what firms tell us they want most, and it&rsquo;s what Lawmate is built around.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="py-16 sm:py-20 border-t border-border">
          <div className="max-w-xl mb-4">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">Transparent pricing</span>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mt-1">Plans tailored for every practice size</h2>
            <p className="text-muted-foreground mt-2">Start free and scale as your firm grows. All plans include a 30-day free trial with full feature access.</p>
          </div>

          <div className="inline-flex border border-border rounded-md overflow-hidden mb-10">
            <button
              className={cn('px-4 py-2.5 text-sm transition-colors', !annualBilling ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground')}
              onClick={() => setAnnualBilling(false)}
            >
              Monthly
            </button>
            <button
              className={cn('px-4 py-2.5 text-sm border-l border-border flex items-center gap-1.5 transition-colors', annualBilling ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground')}
              onClick={() => setAnnualBilling(true)}
            >
              Annual <span className="text-[10px] opacity-80">2 months free</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {/* Starter */}
            <Card className="flex flex-col">
              <CardContent className="p-5 flex flex-col gap-4 flex-1">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Starter</p>
                  <p className="text-[34px] font-semibold tabular-nums text-foreground mt-1">
                    Free <span className="text-[13px] font-normal text-muted-foreground">/ forever</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">Perfect for solo practitioners and independent legal consultants getting started.</p>
                </div>
                <ul className="flex flex-col gap-2 text-sm flex-1">
                  <CheckItem>1 seat</CheckItem>
                  <CheckItem>Up to 5 active matters</CheckItem>
                  <CheckItem>Notes, tasks, calendar &amp; invoicing</CheckItem>
                </ul>
                <Button variant="secondary" className="w-full" onClick={() => navigate('/register')}>Get Started Free</Button>
              </CardContent>
            </Card>

            {/* Professional */}
            <Card className="flex flex-col shadow-[0_3px_10px_rgba(0,0,0,0.08)]">
              <CardContent className="p-5 flex flex-col gap-4 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Professional</p>
                  <Badge>Most Popular</Badge>
                </div>
                <div>
                  <p className="text-[34px] font-semibold tabular-nums text-foreground">
                    {annualBilling ? '₦4,167' : '₦5,000'} <span className="text-[13px] font-normal text-muted-foreground">/ month</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">Built for growing law firms that need documents, reports and real invoicing.</p>
                </div>
                <ul className="flex flex-col gap-2 text-sm flex-1">
                  <CheckItem>5 team members</CheckItem>
                  <CheckItem>Unlimited active matters</CheckItem>
                  <CheckItem>Google Drive &amp; Docs integration</CheckItem>
                  <CheckItem>Activity reports</CheckItem>
                  <CheckItem>Two-factor authentication</CheckItem>
                </ul>
                <Button className="w-full" onClick={() => navigate('/register')}>Start 30-Day Free Trial</Button>
              </CardContent>
            </Card>

            {/* Agency */}
            <Card className="flex flex-col">
              <CardContent className="p-5 flex flex-col gap-4 flex-1">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Agency</p>
                  <p className="text-[34px] font-semibold tabular-nums text-foreground mt-1">
                    {annualBilling ? '₦16,667' : '₦20,000'} <span className="text-[13px] font-normal text-muted-foreground">/ month</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">For established corporate legal departments and large multi-partner practices.</p>
                </div>
                <ul className="flex flex-col gap-2 text-sm flex-1">
                  <CheckItem>Unlimited team members</CheckItem>
                  <CheckItem>Unlimited matters</CheckItem>
                  <CheckItem>Everything in Professional</CheckItem>
                  <CheckItem>Priority support</CheckItem>
                </ul>
                <Button variant="secondary" className="w-full" onClick={() => navigate('/register')}>Start 30-Day Free Trial</Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── CTA band ── */}
        <section className="py-16 sm:py-20 border-t border-border text-center">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">Get started in minutes</span>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mt-1 max-w-xl mx-auto">Ready to run your practice without the chaos?</h2>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">Start your 30-day free trial — no setup fees, cancel anytime.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-6">
            <Button size="lg" onClick={() => navigate('/register')}>Start Your Free Trial</Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/login')}>Sign In to Workspace</Button>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-border py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 text-base font-semibold text-foreground cursor-pointer" onClick={() => navigate('/')}>
            <img src="/logo.svg" alt="" className="h-5 w-5" />
            Lawmate
          </span>
          <nav className="flex flex-wrap justify-center gap-6">
            <button onClick={() => scrollToSection('features')} className="hover:text-primary transition-colors">Features</button>
            <button onClick={() => scrollToSection('impact')} className="hover:text-primary transition-colors">Impact</button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-primary transition-colors">Pricing</button>
            <a href="#privacy" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#terms" className="hover:text-primary transition-colors">Terms of Service</a>
          </nav>
          <span>&copy; {new Date().getFullYear()} Lawmate. All rights reserved.</span>
        </footer>
      </div>
    </div>
  );
}

export default LandingPage;
