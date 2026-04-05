// ============================================================================
// LegalOps - Registration Page
// Registration with password strength indicator and validation
// ============================================================================

'use client';

import React, { useState, useMemo } from 'react';
import { Eye, EyeOff, Loader2, Check, X, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { UnauthenticatedLayout } from './unauthenticated-layout';
import { useAuthStore } from '@/lib/auth-store';
import { navigate } from '@/lib/router';
import { cn } from '@/lib/utils';

// ============================================================================
// Password Strength Helpers
// ============================================================================

interface PasswordChecks {
  minLength: boolean;
  hasUppercase: boolean;
  hasDigit: boolean;
  hasSpecial: boolean;
}

function checkPassword(password: string): PasswordChecks {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasDigit: /\d/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };
}

function getPasswordStrength(checks: PasswordChecks): {
  score: number;
  label: string;
  color: string;
} {
  const passed = Object.values(checks).filter(Boolean).length;
  if (passed <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
  if (passed === 2) return { score: 2, label: 'Fair', color: 'bg-orange-500' };
  if (passed === 3) return { score: 3, label: 'Good', color: 'bg-yellow-500' };
  return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
}

// ============================================================================
// Register Page Component
// ============================================================================

export function RegisterPage() {
  const { register, isLoading } = useAuthStore();
  const [formData, setFormData] = useState({
    organisationName: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const passwordChecks = useMemo(() => checkPassword(formData.password), [formData.password]);
  const passwordStrength = useMemo(() => getPasswordStrength(passwordChecks), [passwordChecks]);

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.organisationName.trim()) {
      newErrors.organisationName = 'Organisation name is required';
    }

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (formData.fullName.trim().split(' ').length < 2) {
      newErrors.fullName = 'Please enter your first and last name';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (!passwordChecks.minLength || !passwordChecks.hasUppercase || !passwordChecks.hasDigit) {
      newErrors.password = 'Password does not meet all requirements';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.agreeTerms) {
      newErrors.agreeTerms = 'You must agree to the Terms of Service';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const nameParts = formData.fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      await register({
        organisation_name: formData.organisationName,
        first_name: firstName,
        last_name: lastName,
        email: formData.email,
        password: formData.password,
      });

      toast.success('Account created successfully!', {
        description: `Welcome to LegalOps, ${firstName}! Your organisation "${formData.organisationName}" has been set up.`,
      });
      navigate('/');
    } catch {
      toast.error('Registration failed. Please try again.');
    }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  // Password requirement items
  const requirements = [
    { key: 'minLength', label: 'At least 8 characters', met: passwordChecks.minLength },
    { key: 'hasUppercase', label: 'One uppercase letter', met: passwordChecks.hasUppercase },
    { key: 'hasDigit', label: 'One digit (number)', met: passwordChecks.hasDigit },
    { key: 'hasSpecial', label: 'One special character (optional)', met: passwordChecks.hasSpecial },
  ];

  return (
    <UnauthenticatedLayout>
      <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-slate-900/30">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>
            Get started with LegalOps for your law firm
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Organisation Name */}
            <div className="space-y-2">
              <Label htmlFor="org-name">Organisation / Firm Name</Label>
              <Input
                id="org-name"
                type="text"
                placeholder="e.g. Adebayo, Okonkwo & Associates"
                value={formData.organisationName}
                onChange={(e) => updateField('organisationName', e.target.value)}
                className="h-10"
                autoComplete="organization"
              />
              {errors.organisationName && (
                <p className="text-xs text-red-500">{errors.organisationName}</p>
              )}
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full-name">Full Name</Label>
              <Input
                id="full-name"
                type="text"
                placeholder="First and last name"
                value={formData.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                className="h-10"
                autoComplete="name"
              />
              {errors.fullName && (
                <p className="text-xs text-red-500">{errors.fullName}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="reg-email">Email address</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="name@firmname.com.ng"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="h-10"
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="reg-password">Password</Label>
              <div className="relative">
                <Input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  className="h-10 pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password}</p>
              )}

              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="space-y-2 mt-2">
                  {/* Strength bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          passwordStrength.color
                        )}
                        style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {passwordStrength.label}
                    </span>
                  </div>

                  {/* Requirements list */}
                  <ul className="space-y-1">
                    {requirements.map((req) => (
                      <li
                        key={req.key}
                        className={cn(
                          'flex items-center gap-1.5 text-xs transition-colors',
                          req.met
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500'
                        )}
                      >
                        {req.met ? (
                          <Check className="h-3 w-3 shrink-0" />
                        ) : (
                          <X className="h-3 w-3 shrink-0" />
                        )}
                        {req.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={formData.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  className="h-10 pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-red-500">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Terms of Service */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="agree-terms"
                  checked={formData.agreeTerms}
                  onCheckedChange={(checked) => updateField('agreeTerms', !!checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="agree-terms" className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 cursor-pointer">
                  I agree to the{' '}
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium cursor-pointer">
                    Terms of Service
                  </span>{' '}
                  and{' '}
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium cursor-pointer">
                    Privacy Policy
                  </span>
                </Label>
              </div>
              {errors.agreeTerms && (
                <p className="text-xs text-red-500">{errors.agreeTerms}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          {/* Back to Login */}
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            Already have an account?{' '}
            <button
              type="button"
              onClick={handleLogin}
              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
            >
              <ArrowLeft className="h-3 w-3" />
              Sign in
            </button>
          </p>
        </CardContent>
      </Card>
    </UnauthenticatedLayout>
  );
}

export default RegisterPage;
