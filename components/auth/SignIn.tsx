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
        length: pwd.length >= 12,
        uppercase: /[A-Z]/.test(pwd),
        lowercase: /[a-z]/.test(pwd),
        number: /[0-9]/.test(pwd),
        special: /[^A-Za-z0-9]/.test(pwd),
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

    // Enable passkey autofill on mount (sign-in view only)
    useEffect(() => {
        if (!showSignUp && typeof window !== 'undefined' && 'PublicKeyCredential' in window) {
            // Prevent duplicate autofill requests
            if (autofillInProgressRef.current) return;
            autofillInProgressRef.current = true;

            // Small delay to let the form render and avoid immediate API call
            const timer = setTimeout(() => {
                handlePasskeySignIn(true);
            }, 500);

            return () => {
                clearTimeout(timer);
                autofillInProgressRef.current = false;
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showSignUp]);

    return (
        <div className='w-full max-w-md mx-auto'>
            <div className='bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg p-6 shadow-xl'>
                {/* Header */}
                <div className='text-center mb-6'>
                    <h2 className='text-xl font-semibold text-white'>
                        {showSignUp ? 'Create Account' : 'Welcome Back'}
                    </h2>
                    <p className='text-sm text-white/60 mt-1'>
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
                            <p className='text-sm text-red-400'>{error}</p>
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
                                    <label className='block text-sm font-medium text-white/70 mb-1.5'>
                                        Email
                                    </label>
                                    <div className='relative'>
                                        <Mail className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
                                        <input
                                            type='email'
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            autoComplete='username webauthn'
                                            className='w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all'
                                            placeholder='you@example.com'
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-white/70 mb-1.5'>
                                        Password
                                    </label>
                                    <div className='relative'>
                                        <Lock className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            autoComplete='current-password webauthn'
                                            className='w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-10 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all'
                                            placeholder='Enter your password'
                                        />
                                        <button
                                            type='button'
                                            onClick={() => setShowPassword(!showPassword)}
                                            className='absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors'
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
                                    className='w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md transition-all duration-200 flex items-center justify-center gap-2'
                                >
                                    {isLoading ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                            className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full'
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
                                <div className='w-full border-t border-white/10'></div>
                            </div>
                            <div className='relative flex justify-center text-sm'>
                                <span className='px-2 bg-black/40 text-white/40'>or</span>
                            </div>
                        </div>

                        <button
                            type='button'
                            onClick={() => handlePasskeySignIn(false)}
                            disabled={isLoading}
                            className='w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2.5 rounded-md transition-all duration-200 flex items-center justify-center gap-2'
                        >
                            <Fingerprint className='w-4 h-4' />
                            Sign in with passkey
                        </button>

                        {/* Toggle to Sign Up */}
                        <p className='text-center text-sm text-white/60 mt-4'>
                            Don&apos;t have an account?{' '}
                            <button
                                type='button'
                                onClick={() => {
                                    setShowSignUp(true);
                                    setError(null);
                                }}
                                className='text-blue-400 hover:text-blue-300 font-medium'
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
                            <label className='block text-sm font-medium text-white/70 mb-1.5'>
                                Full Name
                            </label>
                            <div className='relative'>
                                <KeyRound className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
                                <input
                                    type='text'
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className='w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all'
                                    placeholder='John Doe'
                                />
                            </div>
                        </div>

                        <div>
                            <label className='block text-sm font-medium text-white/70 mb-1.5'>
                                Email
                            </label>
                            <div className='relative'>
                                <Mail className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
                                <input
                                    type='email'
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className='w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all'
                                    placeholder='you@example.com'
                                />
                            </div>
                        </div>

                        <div>
                            <label className='block text-sm font-medium text-white/70 mb-1.5'>
                                Password
                            </label>
                            <div className='relative'>
                                <Lock className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={12}
                                    className='w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-10 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all'
                                    placeholder='Create a password (min 12 chars)'
                                />
                                <button
                                    type='button'
                                    onClick={() => setShowPassword(!showPassword)}
                                    className='absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors'
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
                            <div className='bg-white/5 border border-white/10 rounded-lg px-3 py-2'>
                                <span className='text-white/60 font-bold text-xs tracking-wider uppercase mb-2 block'>
                                    Password Requirements
                                </span>
                                <ul className='flex flex-col gap-1'>
                                    <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.length ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${reqs.length ? "bg-blue-400" : "bg-white/20"}`}></span>
                                        At least 12 characters
                                    </li>
                                    <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.uppercase ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${reqs.uppercase ? "bg-blue-400" : "bg-white/20"}`}></span>
                                        One uppercase letter
                                    </li>
                                    <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.lowercase ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${reqs.lowercase ? "bg-blue-400" : "bg-white/20"}`}></span>
                                        One lowercase letter
                                    </li>
                                    <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.number ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${reqs.number ? "bg-blue-400" : "bg-white/20"}`}></span>
                                        One number
                                    </li>
                                    <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.special ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${reqs.special ? "bg-blue-400" : "bg-white/20"}`}></span>
                                        One special character
                                    </li>
                                </ul>
                            </div>
                        )}

                        <div>
                            <label className='block text-sm font-medium text-white/70 mb-1.5'>
                                Invitation Code
                            </label>
                            <div className='relative'>
                                <KeyRound className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
                                <input
                                    type='text'
                                    value={invitationCode}
                                    onChange={(e) => setInvitationCode(e.target.value)}
                                    required
                                    className='w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all'
                                    placeholder='Enter your invitation code'
                                />
                            </div>
                            <p className='text-xs text-white/40 mt-1'>
                                Sign up requires a valid invitation code
                            </p>
                        </div>

                        <button
                            type='submit'
                            disabled={isLoading || !allRequirementsMet}
                            className='w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md transition-all duration-200 flex items-center justify-center gap-2 mt-6'
                        >
                            {isLoading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full'
                                />
                            ) : (
                                <>
                                    Create Account
                                    <ArrowRight className='w-4 h-4' />
                                </>
                            )}
                        </button>

                        {/* Toggle to Sign In */}
                        <p className='text-center text-sm text-white/60 mt-4'>
                            Already have an account?{' '}
                            <button
                                type='button'
                                onClick={() => {
                                    setShowSignUp(false);
                                    setError(null);
                                }}
                                className='text-blue-400 hover:text-blue-300 font-medium'
                            >
                                Sign in
                            </button>
                        </p>
                    </motion.form>
                )}
            </div>

            {/* Footer Info */}
            <p className='text-center text-xs text-white/40 mt-6'>
                By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
        </div>
    );
}
