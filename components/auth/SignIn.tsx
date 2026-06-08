'use client';

import { useState, FormEvent, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { EyeIcon, EyeClosedIcon, KeyRound, Mail, Lock, ArrowRight, Fingerprint } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';

interface SignInProps {
    onSuccess?: () => void;
}

export default function SignIn({ onSuccess }: SignInProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const returnTo = searchParams.get('returnTo') || '/';
    const [showSignUp, setShowSignUp] = useState(false);
    
    // Form state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [invitationCode, setInvitationCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Password requirements
    const checkPasswordRequirements = (pwd: string) => ({
        length: pwd.length >= 8,
    });
    const reqs = checkPasswordRequirements(password);
    const allRequirementsMet = Object.values(reqs).every(Boolean);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);



    const handleEmailSignIn = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const result = await authClient.signIn.email({
                email,
                password,
                callbackURL: '/',
            });

            if (result.error) {
                setError(result.error.message || 'Failed to sign in');
                return;
            }

            if (onSuccess) {
                onSuccess();
            }
            router.push(returnTo);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignUp = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const result = await authClient.signUp.email({
                email,
                password,
                name,
                callbackURL: '/',
                fetchOptions: {
                    body: {
                        invitationCode,
                    } as Record<string, unknown>,
                },
            });

            if (result.error) {
                setError(result.error.message || 'Failed to create account');
                return;
            }

            if (onSuccess) {
                onSuccess();
            }
            router.push(returnTo);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    // Track autofill request state to prevent duplicate calls
    const autofillInProgressRef = useRef(false);

    const handlePasskeySignIn = async (autoFill: boolean = false) => {
        setError(null);
        if (!autoFill) {
            setIsLoading(true);
        }

        try {
            // Passkey sign-in uses WebAuthn discovery - no email needed
            const result = await authClient.signIn.passkey({
                autoFill,
            });

            if (result.error) {
                // Don't show error for autofill cancellation or abort
                if (autoFill && (
                    result.error.message?.includes('cancelled') ||
                    result.error.message?.includes('abort') ||
                    result.error.message?.includes('AbortError')
                )) {
                    return;
                }
                if (result.error.message?.includes('not registered') || result.error.message?.includes('not found')) {
                    setError('No passkey found. Please sign in with password first to register a passkey.');
                } else {
                    setError(result.error.message || 'Failed to sign in with passkey');
                }
                return;
            }

            if (onSuccess) {
                onSuccess();
            }
            router.push(returnTo);
            router.refresh();
        } catch (err) {
            // Silently ignore AbortError for autofill
            if (autoFill && err instanceof Error && (
                err.name === 'AbortError' ||
                err.message?.includes('abort') ||
                err.message?.includes('cancelled')
            )) {
                return;
            }
            if (!autoFill) {
                setError(err instanceof Error ? err.message : 'An unexpected error occurred');
            }
        } finally {
            if (!autoFill) {
                setIsLoading(false);
            }
            if (autoFill) {
                autofillInProgressRef.current = false;
            }
        }
    };

    // Passkey autofill disabled — causes WebAuthn errors when no passkeys are registered
    // and can interfere with form stability on focus changes.
    // useEffect(() => {
    //     if (!showSignUp && typeof window !== 'undefined' && 'PublicKeyCredential' in window) {
    //         if (autofillInProgressRef.current) return;
    //         autofillInProgressRef.current = true;
    //         const timer = setTimeout(() => {
    //             handlePasskeySignIn(true);
    //         }, 500);
    //         return () => {
    //             clearTimeout(timer);
    //             autofillInProgressRef.current = false;
    //         };
    //     }
    // }, [showSignUp]);

    return (
        <div className='w-full max-w-md mx-auto'>
            <div className='bg-background/80 backdrop-blur-xl border border-border rounded-lg p-6 shadow-2xl'>
                {/* Header */}
                <div className='text-center mb-6'>
                    <h2 className='text-xl font-semibold text-foreground'>
                        {showSignUp ? 'Create Account' : 'Welcome Back'}
                    </h2>
                    <p className='text-sm text-muted-foreground mt-1'>
                        {showSignUp 
                            ? 'Sign up with your invitation code' 
                            : 'Sign in to your account'}
                    </p>
                </div>

                {/* Error Message */}
                <AnimatePresence mode='wait'>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className='mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md'
                        >
                            <p className='text-sm text-red-500'>{error}</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Sign In Section */}
                {!showSignUp && (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className='space-y-6'
                    >
                        {/* Password Form */}
                        <form onSubmit={handleEmailSignIn} className='space-y-4'>
                                <div>
                                    <label className='block text-sm font-medium text-foreground/80 mb-1.5'>
                                        Email
                                    </label>
                                    <div className='relative'>
                                        <Mail className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
                                        <input
                                            type='email'
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            autoComplete='username webauthn'
                                            className='w-full bg-background/50 border border-border rounded-md py-2.5 pl-10 pr-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all'
                                            placeholder='you@example.com'
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-foreground/80 mb-1.5'>
                                        Password
                                    </label>
                                    <div className='relative'>
                                        <Lock className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            autoComplete='current-password webauthn'
                                            className='w-full bg-background/50 border border-border rounded-md py-2.5 pl-10 pr-10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all'
                                            placeholder='Enter your password'
                                        />
                                        <button
                                            type='button'
                                            onClick={() => setShowPassword(!showPassword)}
                                            className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
                                        >
                                            {showPassword ? (
                                                <EyeClosedIcon className='w-4 h-4' />
                                            ) : (
                                                <EyeIcon className='w-4 h-4' />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type='submit'
                                    disabled={isLoading}
                                    className='w-full bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-primary-foreground font-medium py-2.5 rounded-md transition-all duration-200 flex items-center justify-center gap-2'
                                >
                                    {isLoading ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                            className='w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full'
                                        />
                                    ) : (
                                        <>
                                            Sign In
                                            <ArrowRight className='w-4 h-4' />
                                        </>
                                    )}
                                </button>
                            </form>

                        <div className='relative my-4'>
                            <div className='absolute inset-0 flex items-center'>
                                <div className='w-full border-t border-border'></div>
                            </div>
                            <div className='relative flex justify-center text-sm'>
                                <span className='px-2 bg-background/80 text-muted-foreground'>or</span>
                            </div>
                        </div>

                        <button
                            type='button'
                            onClick={() => handlePasskeySignIn(false)}
                            disabled={isLoading}
                            className='w-full bg-card hover:bg-muted border border-border text-foreground font-medium py-2.5 rounded-md transition-all duration-200 flex items-center justify-center gap-2 shadow-sm'
                        >
                            <Fingerprint className='w-4 h-4' />
                            Sign in with passkey
                        </button>

                        {/* Toggle to Sign Up */}
                        <p className='text-center text-sm text-muted-foreground mt-4'>
                            Don&apos;t have an account?{' '}
                            <button
                                type='button'
                                onClick={() => {
                                    setShowSignUp(true);
                                    setError(null);
                                }}
                                className='text-primary hover:text-primary/80 font-medium'
                            >
                                Create one
                            </button>
                        </p>
                    </motion.div>
                )}

                {/* Sign Up Form */}
                {showSignUp && (
                    <motion.form
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        onSubmit={handleSignUp}
                        className='space-y-4'
                    >
                        <div>
                            <label className='block text-sm font-medium text-foreground/80 mb-1.5'>
                                Full Name
                            </label>
                            <div className='relative'>
                                <KeyRound className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
                                <input
                                    type='text'
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className='w-full bg-background/50 border border-border rounded-md py-2.5 pl-10 pr-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all'
                                    placeholder='John Doe'
                                />
                            </div>
                        </div>

                        <div>
                            <label className='block text-sm font-medium text-foreground/80 mb-1.5'>
                                Email
                            </label>
                            <div className='relative'>
                                <Mail className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
                                <input
                                    type='email'
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className='w-full bg-background/50 border border-border rounded-md py-2.5 pl-10 pr-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all'
                                    placeholder='you@example.com'
                                />
                            </div>
                        </div>

                        <div>
                            <label className='block text-sm font-medium text-foreground/80 mb-1.5'>
                                Password
                            </label>
                            <div className='relative'>
                                <Lock className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    className='w-full bg-background/50 border border-border rounded-md py-2.5 pl-10 pr-10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all'
                                    placeholder='Create a password (min 8 chars)'
                                />
                                <button
                                    type='button'
                                    onClick={() => setShowPassword(!showPassword)}
                                    className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
                                >
                                    {showPassword ? (
                                        <EyeClosedIcon className='w-4 h-4' />
                                    ) : (
                                        <EyeIcon className='w-4 h-4' />
                                    )}
                                </button>
                            </div>
                        </div>

                        {password.length > 0 && (
                            <div className='bg-background/50 border border-border rounded-lg px-3 py-2'>
                                <span className='text-muted-foreground font-bold text-xs tracking-wider uppercase mb-2 block'>
                                    Password Requirements
                                </span>
                                <ul className='flex flex-col gap-1'>
                                    <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.length ? "text-primary font-medium" : "text-muted-foreground/70"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${reqs.length ? "bg-primary" : "bg-muted-foreground/30"}`}></span>
                                        At least 8 characters
                                    </li>
                                </ul>
                            </div>
                        )}

                        <div>
                            <label className='block text-sm font-medium text-foreground/80 mb-1.5'>
                                Invitation Code
                            </label>
                            <div className='relative'>
                                <KeyRound className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
                                <input
                                    type='text'
                                    value={invitationCode}
                                    onChange={(e) => setInvitationCode(e.target.value)}
                                    required
                                    className='w-full bg-background/50 border border-border rounded-md py-2.5 pl-10 pr-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all'
                                    placeholder='Enter your invitation code'
                                />
                            </div>
                            <p className='text-xs text-muted-foreground mt-1'>
                                Sign up requires a valid invitation code
                            </p>
                        </div>

                        <button
                            type='submit'
                            disabled={isLoading || !allRequirementsMet}
                            className='w-full bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-primary-foreground font-medium py-2.5 rounded-md transition-all duration-200 flex items-center justify-center gap-2 mt-6'
                        >
                            {isLoading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className='w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full'
                                />
                            ) : (
                                <>
                                    Create Account
                                    <ArrowRight className='w-4 h-4' />
                                </>
                            )}
                        </button>

                        {/* Toggle to Sign In */}
                        <p className='text-center text-sm text-muted-foreground mt-4'>
                            Already have an account?{' '}
                            <button
                                type='button'
                                onClick={() => {
                                    setShowSignUp(false);
                                    setError(null);
                                }}
                                className='text-primary hover:text-primary/80 font-medium'
                            >
                                Sign in
                            </button>
                        </p>
                    </motion.form>
                )}
            </div>

            {/* Footer Info */}
            <p className='text-center text-xs text-foreground/40 mt-6'>
                By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
        </div>
    );
}
