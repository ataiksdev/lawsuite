'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scale,
  Briefcase,
  Users,
  CheckSquare,
  FileText,
  CreditCard,
  ArrowRight,
  Check,
  Shield,
  Zap,
  Star,
  ChevronRight,
  Menu,
  X,
  Lock,
  PieChart,
  FolderTree,
  MessageSquareCode,
  Building2,
} from 'lucide-react';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [annualBilling, setAnnualBilling] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 text-slate-900 dark:text-slate-50 selection:bg-emerald-500 selection:text-white font-sans overflow-x-hidden">
      {/* ── Background Decorative Gradients & Grid ── */}
      <div className="absolute top-0 left-0 right-0 h-[1000px] overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-emerald-300/30 dark:bg-emerald-500/10 blur-[140px]" />
        <div className="absolute top-20 -right-40 w-[600px] h-[600px] rounded-full bg-teal-300/30 dark:bg-teal-500/10 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(to right, #10b981 1px, transparent 1px), linear-gradient(to bottom, #10b981 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/80 to-white dark:via-slate-950/80 dark:to-slate-950" />
      </div>

      {/* ── Navigation Bar ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/60 px-4 sm:px-8 py-4 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25">
              <Scale className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 dark:from-white dark:via-slate-200 dark:to-slate-400 bg-clip-text text-transparent">
              Lawmate
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button onClick={() => scrollToSection('features')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Features
            </button>
            <button onClick={() => scrollToSection('impact')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Impact
            </button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Pricing
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden md:flex items-center gap-4">
              <Button
                variant="ghost"
                className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-xl px-5 py-2.5 h-auto text-sm font-medium"
                onClick={() => navigate('/login')}
              >
                Sign In
              </Button>
              <Button
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl shadow-lg shadow-emerald-500/25 px-5 py-2.5 h-auto text-sm font-medium transition-all hover:scale-[1.02]"
                onClick={() => navigate('/register')}
              >
                Get Started
              </Button>
            </div>

            <button
              className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-b border-slate-200 dark:border-slate-800/60 p-6 flex flex-col gap-4 md:hidden shadow-2xl z-50"
            >
              <button onClick={() => scrollToSection('features')} className="text-left text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white py-2 text-lg font-medium">
                Features
              </button>
              <button onClick={() => scrollToSection('impact')} className="text-left text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white py-2 text-lg font-medium">
                Impact
              </button>
              <button onClick={() => scrollToSection('pricing')} className="text-left text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white py-2 text-lg font-medium">
                Pricing
              </button>
              <div className="flex flex-col gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button
                  variant="outline"
                  className="w-full justify-center border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 py-6 rounded-xl text-base"
                  onClick={() => navigate('/login')}
                >
                  Sign In
                </Button>
                <Button
                  className="w-full justify-center bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-6 rounded-xl text-base shadow-lg shadow-emerald-500/25"
                  onClick={() => navigate('/register')}
                >
                  Get Started
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative pt-20 pb-32 px-4 sm:px-8 max-w-7xl mx-auto z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-7 flex flex-col items-start gap-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm font-semibold tracking-wide">
              <Zap className="h-4 w-4" /> Next-Gen Practice Management Platform
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
              Transform Your Legal Practice with{' '}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent">
                Intelligent Automation
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
              Streamline complex matters, automate client intake, manage secure document drives, and track billable workflows seamlessly. Built for ambitious law firms and modern corporate legal teams.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto pt-4">
              <Button
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl shadow-xl shadow-emerald-500/25 px-8 py-6 h-auto text-base font-semibold transition-all hover:scale-[1.02] flex items-center justify-center gap-2 group"
                onClick={() => navigate('/register')}
              >
                Start Your 30-Day Free Trial
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                variant="outline"
                className="border-slate-300 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl px-8 py-6 h-auto text-base font-semibold transition-all"
                onClick={() => scrollToSection('features')}
              >
                Explore Features
              </Button>
            </div>

            <div className="flex items-center gap-8 pt-8 border-t border-slate-200 dark:border-slate-800/80 w-full">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">30%+</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium mt-0.5">Billable Hours Saved</span>
              </div>
              <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">100%</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium mt-0.5">Case Compliance</span>
              </div>
              <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">Zero</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium mt-0.5">Missed Deadlines</span>
              </div>
            </div>
          </motion.div>

          {/* Floating Glassmorphism Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-5 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 rounded-3xl blur-3xl transform -rotate-6" />
            
            <div className="relative backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/50 rounded-3xl p-6 shadow-2xl flex flex-col gap-6">
              {/* Mockup Header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                  <span className="text-xs font-mono text-slate-500 ml-2">lawmate-workspace</span>
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-slate-800/80 px-3 py-1 rounded-full text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                  <Shield className="h-3 w-3" /> Secure Portal
                </div>
              </div>

              {/* Mockup Content - Active Matter Summary */}
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Active Matter</span>
                    <span className="text-base font-bold text-slate-900 dark:text-white">Acquisition of TechCorp Inc.</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Client: Apex Global Logistics</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                    In Progress
                  </span>
                </div>

                {/* Mockup Kanban Preview */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">To Review</span>
                      <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">3 Tasks</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-lg flex flex-col gap-1.5 shadow-sm">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Review Merger Agreement</span>
                      <span className="text-[10px] text-amber-400 font-medium">Due in 2 days</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Completed</span>
                      <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-emerald-400 font-medium">12 Tasks</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-lg flex flex-col gap-1.5 shadow-sm">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200 line-through dark:text-slate-400">Due Diligence Report</span>
                      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                        <Check className="h-3 w-3" /> Approved
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mockup Client Intake Card */}
                <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Client Portal Active</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">3 new documents uploaded by client</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features Bento Grid Section ── */}
      <section id="features" className="py-24 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-200 dark:border-slate-800/60">
        <div className="flex flex-col items-center text-center gap-4 mb-16">
          <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold tracking-widest uppercase">Everything You Need</span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Designed for Modern Practice Excellence
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl">
            Lawmate integrates your critical legal workflows into a unified, intelligent workspace, eliminating data silos and friction.
          </p>
        </div>

        {/* Bento Box Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* 1. Matter & Case Management */}
          <motion.div
            whileHover={{ y: -5 }}
            transition={{ duration: 0.2 }}
            className="md:col-span-2 backdrop-blur-xl bg-gradient-to-br from-white/90 to-white/40 dark:from-slate-900/90 dark:to-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 flex flex-col justify-between overflow-hidden relative group"
          >
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
            <div className="flex flex-col gap-4 relative z-10 mb-8">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                <Briefcase className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Matter & Case Management</h3>
              <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed max-w-xl">
                Maintain complete control over every matter. Track case files, log structured notes, schedule court hearings, and monitor financial budgets in real time.
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Real-time matter syncing active</span>
              </div>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <span className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">Notes</span>
                <span className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">Calendar</span>
                <span className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">Budgets</span>
              </div>
            </div>
          </motion.div>

          {/* 2. Client Management (Added as requested) */}
          <motion.div
            whileHover={{ y: -5 }}
            transition={{ duration: 0.2 }}
            className="backdrop-blur-xl bg-gradient-to-br from-white/90 to-white/40 dark:from-slate-900/90 dark:to-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 flex flex-col justify-between relative group"
          >
            <div className="absolute top-0 right-0 w-60 h-60 bg-teal-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-teal-500/10 transition-colors" />
            <div className="flex flex-col gap-4 relative z-10">
              <div className="h-12 w-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shadow-inner">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Client Management & Intake</h3>
              <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                Seamless client intake, communication logs, and secure client portals. Empower clients to upload documents, review case updates, and pay invoices instantly.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between relative z-10">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Secure Portals</span>
              <span className="text-xs font-bold text-teal-400 flex items-center gap-1">
                256-Bit Encrypted <Shield className="h-3.5 w-3.5" />
              </span>
            </div>
          </motion.div>

          {/* 3. Task Kanban & Workflows */}
          <motion.div
            whileHover={{ y: -5 }}
            transition={{ duration: 0.2 }}
            className="backdrop-blur-xl bg-gradient-to-br from-white/90 to-white/40 dark:from-slate-900/90 dark:to-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 flex flex-col justify-between relative group"
          >
            <div className="absolute top-0 right-0 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
            <div className="flex flex-col gap-4 relative z-10">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                <CheckSquare className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Task Kanban & Workflows</h3>
              <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                Visualize firm workflows with intuitive drag-and-drop Kanban boards. Assign tasks, attach documents, set priority levels, and never miss a court deadline.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between relative z-10">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Workflow Engine</span>
              <span className="text-xs font-bold text-emerald-400">Automated Reminders</span>
            </div>
          </motion.div>

          {/* 4. Integrated Document Drive */}
          <motion.div
            whileHover={{ y: -5 }}
            transition={{ duration: 0.2 }}
            className="backdrop-blur-xl bg-gradient-to-br from-white/90 to-white/40 dark:from-slate-900/90 dark:to-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 flex flex-col justify-between relative group"
          >
            <div className="absolute top-0 right-0 w-60 h-60 bg-teal-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-teal-500/10 transition-colors" />
            <div className="flex flex-col gap-4 relative z-10">
              <div className="h-12 w-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shadow-inner">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Integrated Document Drive</h3>
              <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                Centralized, cross-matter document repository. Maintain strict folder hierarchies, track version history, and link files directly to specific tasks or client records.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between relative z-10">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Storage Architecture</span>
              <span className="text-xs font-bold text-teal-400">Cloud Synced</span>
            </div>
          </motion.div>

          {/* 5. Automated Billing & Invoicing */}
          <motion.div
            whileHover={{ y: -5 }}
            transition={{ duration: 0.2 }}
            className="backdrop-blur-xl bg-gradient-to-br from-white/90 to-white/40 dark:from-slate-900/90 dark:to-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 flex flex-col justify-between relative group"
          >
            <div className="absolute top-0 right-0 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
            <div className="flex flex-col gap-4 relative z-10">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                <CreditCard className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Automated Billing & Invoicing</h3>
              <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                Log billable hours, record matter expenses, and generate professional invoices instantly. Integrated with Paystack for seamless, secure online payments.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between relative z-10">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Payment Gateway</span>
              <span className="text-xs font-bold text-emerald-400">Paystack Enabled</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Impact & Proof Section ── */}
      <section id="impact" className="py-24 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-200 dark:border-slate-800/60">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="flex flex-col gap-6">
            <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold tracking-widest uppercase">Proven Excellence</span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.1]">
              Empowering High-Performing Legal Teams
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed">
              Lawmate eliminates administrative overhead so your team can focus on what truly matters: delivering exceptional legal counsel and winning cases.
            </p>

            <div className="flex flex-col gap-4 pt-4">
              <div className="flex items-center gap-4 bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Check className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-bold text-slate-900 dark:text-white">Bank-Grade Security</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Encrypted data at rest and in transit with automated backups.</span>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
                <div className="h-10 w-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-bold text-slate-900 dark:text-white">Multi-Organisation Support</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Manage multiple firm branches or corporate entities seamlessly.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white dark:from-slate-900 to-slate-50 dark:to-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 sm:p-12 shadow-2xl flex flex-col gap-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center gap-2 text-amber-400">
              <Star className="h-5 w-5 fill-amber-400" />
              <Star className="h-5 w-5 fill-amber-400" />
              <Star className="h-5 w-5 fill-amber-400" />
              <Star className="h-5 w-5 fill-amber-400" />
              <Star className="h-5 w-5 fill-amber-400" />
            </div>
            <blockquote className="text-xl sm:text-2xl font-medium text-slate-700 dark:text-slate-200 leading-relaxed italic">
              "Lawmate completely transformed how our firm operates. We reduced our billing cycles by half and our clients love the secure document portal. It's an indispensable asset for our practice."
            </blockquote>
            <div className="flex items-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                OA
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold text-slate-900 dark:text-white">Olumide Akintunde</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Managing Partner, Apex Legal Partners</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Section ── */}
      <section id="pricing" className="py-24 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-200 dark:border-slate-800/60">
        <div className="flex flex-col items-center text-center gap-4 mb-12">
          <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold tracking-widest uppercase">Transparent Pricing</span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Plans Tailored for Every Practice Size
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl">
            Start free and scale as your firm grows. All plans include a 30-day free trial with full feature access.
          </p>

          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl mt-6">
            <button
              className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${!annualBilling ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setAnnualBilling(false)}
            >
              Monthly Billing
            </button>
            <button
              className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${annualBilling ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setAnnualBilling(true)}
            >
              Annual Billing <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {/* Starter Plan */}
          <div className="bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 flex flex-col justify-between gap-8 relative">
            <div className="flex flex-col gap-4">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider">Starter</span>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">Free</span>
                <span className="text-slate-500 dark:text-slate-400 text-sm">/ forever</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Perfect for solo practitioners and independent legal consultants getting started.
              </p>
              <div className="flex flex-col gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> 1 User Account
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Up to 15 Active Matters
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Basic Client Intake
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> 5GB Secure Drive Storage
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-white py-6 rounded-xl text-base font-semibold"
              onClick={() => navigate('/register')}
            >
              Get Started Free
            </Button>
          </div>

          {/* Professional Plan (Highlighted) */}
          <div className="bg-gradient-to-b from-white dark:from-slate-900 via-white dark:via-slate-900 to-slate-50 dark:to-slate-950 border-2 border-emerald-500 rounded-3xl p-8 flex flex-col justify-between gap-8 relative shadow-2xl shadow-emerald-500/10 md:-translate-y-4">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg">
              Most Popular
            </div>
            <div className="flex flex-col gap-4">
              <span className="text-emerald-400 text-sm font-bold uppercase tracking-wider">Professional</span>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{annualBilling ? '₦40,000' : '₦50,000'}</span>
                <span className="text-slate-500 dark:text-slate-400 text-sm">/ month</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                Built for growing law firms requiring advanced workflows and secure client portals.
              </p>
              <div className="flex flex-col gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Up to 10 Team Members
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Unlimited Active Matters
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Advanced Client Portals & Intake
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Automated Paystack Invoicing
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> 100GB Secure Drive Storage
                </div>
              </div>
            </div>
            <Button
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white py-6 rounded-xl text-base font-semibold shadow-lg shadow-emerald-500/25"
              onClick={() => navigate('/register')}
            >
              Start 30-Day Free Trial
            </Button>
          </div>

          {/* Agency Plan */}
          <div className="bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-8 flex flex-col justify-between gap-8 relative">
            <div className="flex flex-col gap-4">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider">Agency</span>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{annualBilling ? '₦120,000' : '₦150,000'}</span>
                <span className="text-slate-500 dark:text-slate-400 text-sm">/ month</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                For established corporate legal departments and large multi-partner practices.
              </p>
              <div className="flex flex-col gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Unlimited Team Members
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Unlimited Active Matters
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Multi-Organisation Support
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Custom API Integrations
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> 1TB Secure Drive Storage & Priority Support
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-white py-6 rounded-xl text-base font-semibold"
              onClick={() => navigate('/register')}
            >
              Start 30-Day Free Trial
            </Button>
          </div>
        </div>
      </section>

      {/* ── Final CTA Banner ── */}
      <section className="py-20 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-200 dark:border-slate-800/60">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-8 sm:p-16 text-center text-white flex flex-col items-center gap-8 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-black/20 rounded-full blur-3xl pointer-events-none" />
          
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl leading-[1.1]">
            Ready to Modernize Your Legal Practice?
          </h2>
          <p className="text-emerald-100 text-lg sm:text-xl max-w-2xl">
            Join ambitious law firms and legal teams streamlining their entire practice with Lawmate. Get started in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Button
              className="bg-white text-emerald-900 hover:bg-slate-100 rounded-xl px-8 py-6 h-auto text-base font-bold shadow-xl transition-all hover:scale-[1.02] w-full sm:w-auto"
              onClick={() => navigate('/register')}
            >
              Start Your Free Trial
            </Button>
            <Button
              variant="outline"
              className="border-white/30 bg-transparent hover:bg-white/10 text-white rounded-xl px-8 py-6 h-auto text-base font-bold transition-all w-full sm:w-auto"
              onClick={() => navigate('/login')}
            >
              Sign In to Workspace
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950 py-12 px-4 sm:px-8 text-slate-500 text-sm transition-all">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Scale className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold text-slate-800 dark:text-slate-200 tracking-tight">Lawmate</span>
          </div>

          <div className="flex flex-wrap justify-center gap-8 text-slate-500 dark:text-slate-400">
            <button onClick={() => scrollToSection('features')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Features</button>
            <button onClick={() => scrollToSection('impact')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Impact</button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Pricing</button>
            <a href="#privacy" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Privacy Policy</a>
            <a href="#terms" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Terms of Service</a>
          </div>

          <div className="text-center md:text-right space-y-1">
            <p>&copy; {new Date().getFullYear()} Lawmate. All rights reserved.</p>
            <p className="text-xs text-slate-400 dark:text-slate-600">Empowering modern legal practice excellence.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
