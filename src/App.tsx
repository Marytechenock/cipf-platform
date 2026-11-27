/**
 * Core Application Entrypoint for MAZ Kariba Winter School 2026 EMS
 */

import React, { useState, useEffect, FormEvent, useCallback, lazy, Suspense } from 'react';
import { api, isAccessPeriodError, isApiErrorStatus } from './lib/api';
import { User, GalleryImage, Sponsor, Testimonial, AdventureActivity } from './types';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import EventPhotoAlbums from './components/EventPhotoAlbums';
import WhatToWear from './components/WhatToWear';
import Carousel from './components/Carousel';
import ProgramView from './components/ProgramView';
import PresenterQuestions from './components/sessionQuestions/PresenterQuestions';
import SessionQuestionDisplay from './components/sessionQuestions/SessionQuestionDisplay';
import SpeakerView from './components/SpeakerView';
import Chatbot from './components/Chatbot';
import QAView from './components/QAView';
import QAResultsView from './components/QAResultsView';
import ElectionResultsView from './components/ElectionResultsView';
import VotingView from './components/VotingView';
import CheckInSearch from './components/checkin/CheckInSearch';
import CheckInConfirm from './components/checkin/CheckInConfirm';
import CheckInSuccess from './components/checkin/CheckInSuccess';
import CheckInSupport from './components/checkin/CheckInSupport';
import WhatsAppSupport from './components/checkin/WhatsAppSupport';
import PublicAttendees from './components/PublicAttendees';
import { navigateTo, parseAppRoute } from './lib/routing';
import {
    Sparkles, ShieldCheck, MapPin, Compass, Award, Calendar,
    Map, Star, MessageSquareHeart, Heart, Send, CheckCircle2,
    ChevronLeft, ChevronRight, Eye, EyeOff, Play, X, User as UserIcon, Lock, Mail,
    Image as ImageIcon, Users, GraduationCap, Briefcase, Globe, Wind, Bath, Shield, Car,
    Building2, Trophy, ExternalLink, Quote, Tv, Sunset, Ship, PawPrint, Bike, Clock,
    Bed, Utensils, Waves, Target, Zap, Package, Phone
} from 'lucide-react';
import logo from "@/assets/images/logo-1.png";
import ChartIcon from "@/src/components/ChartIcon.tsx";
import CertificateIcon from "@/src/components/CertificateIcon.tsx";
import StarIcon from "@/src/components/StarIcon.tsx";
import mimsLogo from '@/assets/images/mims logo.png';
import immLogo from '@/assets/images/IMM.jpeg';
import midpLogo from '@/assets/images/MAZ MIDP.png';
import fallsHeroImage from '@/assets/images/falls4.avif';
import loginBuildingImage from '@/assets/images/login-building.png';

const AdminRoute = lazy(() => import('./components/admin/AdminRoute'));
const SuperAdminPortal = lazy(() => import('./components/superadmin/SuperAdminPortal'));
const MARKETERS_CONVENTION_GALLERY_CATEGORY = '17th Annual Marketers Convention 2025 Bulawayo';
const CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY = '18th Annual Marketers Convention 2026 Victoria Falls';

function useLocationPath() {
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    return path;
}

export default function App() {
    const [user, setUser] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState<string>('voting');
    const [galleryCategory, setGalleryCategory] = useState<'all' | '2024' | '2025' | '2026' | typeof MARKETERS_CONVENTION_GALLERY_CATEGORY | typeof CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY>('all');
    const [driveLink, setDriveLink] = useState('https://drive.google.com/drive/folders/18K9p_0S79z77X-maz-kariba-winter-school-gallery-2026');

    // Login form status
    const [loginEmail, setLoginEmail] = useState('');
    const [memberIdentifier, setMemberIdentifier] = useState('');
    const [loginMode, setLoginMode] = useState<'member' | 'account'>('account');
    const [loginPassword, setLoginPassword] = useState('');
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [loginNotice, setLoginNotice] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [postLoginPath, setPostLoginPath] = useState<string | null>(null);
    const [authBootstrapComplete, setAuthBootstrapComplete] = useState(false);

    // App core database state
    const [carouselImages, setCarouselImages] = useState<any[]>([]);
    const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
    const [sponsors, setSponsors] = useState<Sponsor[]>([]);
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);
    const [adventures, setAdventures] = useState<AdventureActivity[]>([]);

    // Lightbox modal state for gallery
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

    const currentPath = useLocationPath();
    const currentRoute = parseAppRoute(currentPath);
    const currentTab = currentRoute.kind === 'admin' ? 'admin' : activeTab;

    // Load user session on startup
    useEffect(() => {
        let isActive = true;

        void api.getOptionalSession()
            .then((response) => {
                if (!isActive) return;
                setUser(response.user);
                if (response.user) setActiveTab('voting');
            })
            .catch((error) => {
                if (!isActive) return;
                if (isAccessPeriodError(error)) {
                    setLoginError(error.message);
                    navigateTo('/');
                }
                if (!isApiErrorStatus(error, [401])) {
                    console.error('Session bootstrap failed:', error);
                }
                setUser(null);
            })
            .finally(() => {
                if (isActive) {
                    setAuthBootstrapComplete(true);
                }
            });

        return () => {
            isActive = false;
        };
    }, []);

    // Pick up administrator access changes for users who are already signed in.
    useEffect(() => {
        if (!user) return;
        let active = true;
        let pending = false;
        const refreshSession = async () => {
            if (pending || document.visibilityState === 'hidden') return;
            pending = true;
            try {
                const response = await api.getOptionalSession();
                if (!active) return;
                setUser(response.user);
                if (!response.user) {
                    setLoginError('Your session has ended. Please sign in again.');
                    navigateTo('/');
                    return;
                }
                if (user.role === 'member' && response.user?.role === 'attendee') {
                    setActiveTab('home');
                }
            } catch (error) {
                if (active && isAccessPeriodError(error)) {
                    setUser(null);
                    setLoginError(error.message);
                    navigateTo('/');
                }
            } finally {
                pending = false;
            }
        };
        const timer = window.setInterval(() => { void refreshSession(); }, 30000);
        const onFocus = () => { void refreshSession(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            active = false;
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [user?.id, user?.role]);

    // Only real user interaction renews the server-side idle timer; background polling does not.
    useEffect(() => {
        if (!user) return;
        let lastSent = 0;
        let pending = false;
        const recordActivity = () => {
            const now = Date.now();
            if (document.visibilityState === 'hidden' || pending || now - lastSent < 60_000) return;
            pending = true;
            void api.recordActivity().then(() => { lastSent = Date.now(); }).catch(error => {
                if (isApiErrorStatus(error, [401]) || isAccessPeriodError(error)) {
                    setUser(null);
                    setLoginError(isAccessPeriodError(error) ? error.message : 'Your session has ended. Please sign in again.');
                    navigateTo('/');
                }
            }).finally(() => { pending = false; });
        };
        window.addEventListener('pointerdown', recordActivity);
        window.addEventListener('keydown', recordActivity);
        window.addEventListener('touchstart', recordActivity);
        window.addEventListener('scroll', recordActivity, { passive: true });
        return () => {
            window.removeEventListener('pointerdown', recordActivity);
            window.removeEventListener('keydown', recordActivity);
            window.removeEventListener('touchstart', recordActivity);
            window.removeEventListener('scroll', recordActivity);
        };
    }, [user?.id]);

    // Fetch critical layout details from DB
    const loadAppData = useCallback(async () => {
        const [galleryResult, sponsorsResult, testimonialsResult, driveLinkResult, adventuresResult] = await Promise.allSettled([
            api.getGallery(),
            api.getSponsors(),
            api.getTestimonials(),
            api.getGoogleDriveLink(),
            api.getAdventures()
        ]);

        if (galleryResult.status === 'fulfilled') {
            setGalleryImages(galleryResult.value);
            setCarouselImages(galleryResult.value.map(g => ({
                id: g.id,
                url: g.url,
                caption: g.caption,
                description: g.description
            })));
        } else {
            console.error('Error loading gallery in loadAppData:', galleryResult.reason);
        }

        if (sponsorsResult.status === 'fulfilled') {
            setSponsors(sponsorsResult.value);
        } else {
            console.error('Error loading sponsors in loadAppData:', sponsorsResult.reason);
        }

        if (testimonialsResult.status === 'fulfilled') {
            setTestimonials(testimonialsResult.value);
        } else {
            console.error('Error loading testimonials in loadAppData:', testimonialsResult.reason);
        }

        if (driveLinkResult.status === 'fulfilled') {
            setDriveLink(driveLinkResult.value.link);
        } else {
            console.error('Error loading google drive link in loadAppData:', driveLinkResult.reason);
        }

        if (adventuresResult.status === 'fulfilled') {
            setAdventures(adventuresResult.value);
        } else {
            console.error('Error loading adventures:', adventuresResult.reason);
        }
    }, [user?.role]);

    useEffect(() => {
        if (user?.role !== 'member' && (currentRoute.kind === 'app' || currentRoute.kind === 'admin')) {
            void loadAppData();
        }
    }, [loadAppData, currentRoute.kind, user?.role]);

    // Testimonial Carousel Autoslide
    useEffect(() => {
        if (testimonials.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentTestimonialIndex(prev => (prev + 1) % testimonials.length);
        }, 8000);
        return () => clearInterval(interval);
    }, [testimonials.length]);

    // LOGIN HANDLER
    const handleLoginSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoginError('');
        setLoginNotice('');
        setLoginLoading(true);

        try {
            const response = loginMode === 'member'
                ? await api.loginMember(memberIdentifier.trim())
                : await api.login({
                email: loginEmail.trim(),
                password: loginPassword,
                rememberMe
            });

            setUser(response.user);
            setActiveTab('voting');
            if (currentRoute.kind === 'qa-results' || currentRoute.kind === 'election-results' || currentRoute.kind === 'session-questions') {
                navigateTo(window.location.pathname);
            } else if (response.user.role === 'super_admin') {
                navigateTo('/super-admin');
            } else if (postLoginPath === '/admin' && response.user.role === 'admin') {
                navigateTo('/admin');
            } else {
                navigateTo('/');
            }
            setPostLoginPath(null);
        } catch (err: any) {
            setLoginError(err.message || 'Sign-in failed. Please check your details.');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleLogout = () => {
        void api.logout().catch((error) => {
            console.error('Logout failed:', error);
        });
        setUser(null);
        setActiveTab('home');
        setLoginEmail('');
        setMemberIdentifier('');
        setLoginPassword('');
        setLoginNotice('');
        setPostLoginPath(null);
        navigateTo('/');
    };

    const handleForgotPasswordClick = async () => {
        if (!loginEmail.trim()) {
            alert('Please fill in your email address first so we can show the recovery guidance.');
            return;
        }
        try {
            const res = await api.forgotPassword(loginEmail.trim());
            alert(res.message);
        } catch (e: any) {
            alert(e.message || 'Attendee unlisted.');
        }
    };

    const handlePublicTabChange = (_tab: string) => {
        setActiveTab('voting');
        if (currentRoute.kind !== 'app') {
            navigateTo('/');
        }
    };

    const handleAdminShortcut = () => {
        navigateTo('/admin');
    };

    const handleRequireAdminLogin = useCallback((message: string) => {
        setUser(null);
        setActiveTab('voting');
        setLoginError('');
        setLoginNotice(message);
        setPostLoginPath('/admin');
        navigateTo('/');
    }, []);

    const handleExitAdmin = () => {
        setLoginNotice('');
        navigateTo('/');
    };

    useEffect(() => {
        if (!user) return;
        if (user.role === 'super_admin') {
            if (currentRoute.kind !== 'super-admin') navigateTo('/super-admin');
            return;
        }
        if (currentRoute.kind === 'admin') return;
        if (activeTab !== 'voting') setActiveTab('voting');
        const isAdminResultsRoute = user.role === 'admin'
            && (currentRoute.kind === 'election-results' || currentRoute.kind === 'qa-results');
        const isVotingSupportRoute = currentRoute.kind === 'voter-registration'
            && currentRoute.path === '/voter-registration/support';
        if (currentRoute.kind !== 'app' && !isAdminResultsRoute && !isVotingSupportRoute) navigateTo('/');
    }, [user?.role, activeTab, currentPath]);

    // Gallery Filters
    const filteredGallery = galleryCategory === 'all'
        ? galleryImages
        : galleryImages.filter(img => img.category === galleryCategory);

    // Gallery next/prev slide for lightbox
    const handleLightboxNav = (direction: 'next' | 'prev') => {
        if (!selectedImage) return;
        const currentList = filteredGallery;
        const currentIdx = currentList.findIndex(x => x.id === selectedImage.id);
        if (currentIdx === -1) return;

        let nextIdx = currentIdx;
        if (direction === 'next') {
            nextIdx = (currentIdx + 1) % currentList.length;
        } else {
            nextIdx = (currentIdx - 1 + currentList.length) % currentList.length;
        }
        setSelectedImage(currentList[nextIdx]);
    };

    const handlePartnerLogoError = (fallbackSrc: string) => (event: React.SyntheticEvent<HTMLImageElement>) => {
        const image = event.currentTarget;
        if (image.dataset.fallbackApplied === 'true') {
            image.style.display = 'none';
            return;
        }

        image.dataset.fallbackApplied = 'true';
        image.src = fallbackSrc;
    };

    // Helper to display sponsor logo (image or emoji fallback)
    const renderSponsorLogo = (logoUrl: string, name: string) => {
        if (logoUrl?.startsWith('/uploads/')) {
            return (
                <img
                    src={logoUrl}
                    alt={name}
                    className="h-full w-full object-cover rounded-xl"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).parentElement!.innerHTML = '<Building2 className="h-6 w-6" />';
                    }}
                />
            );
        }
        return <Building2 className="h-6 w-6" />;
    };

    // Helper to get sponsor category icon
    const getSponsorCategoryIcon = (category: string) => {
        if (category === 'Technology Partner') return <Zap className="h-3 w-3 text-blue-500" />;
        if (category === 'Exhibitor') return <Building2 className="h-3 w-3 text-emerald-600" />;
        if (category === 'Dinner') return <Award className="h-3 w-3 text-amber-500" />;
        if (category === 'Giveaways') return <Package className="h-3 w-3 text-purple-500" />;
        if (category === 'Session') return <MessageSquareHeart className="h-3 w-3 text-[#8B6914]" />;
        return <Award className="h-3 w-3 text-gray-500" />;
    };

    // Members have a dedicated workspace, independent of event tabs or URL state.
    if (user?.role === 'member') {
        const isVotingSupport = currentRoute.kind === 'voter-registration' && currentRoute.path === '/voter-registration/support';
        return (
            <div className="min-h-screen bg-white text-gray-800 flex flex-col font-sans antialiased">
                <Navbar user={user} onLogout={handleLogout} activeTab={isVotingSupport ? 'support' : 'voting'}
                    supportHref="/voter-registration/support" supportLabel="Voting support"
                    onSelectTab={handlePublicTabChange} onSelectAdmin={handleAdminShortcut} />
                <div className="checkin-site-content flex flex-1 flex-col">
                    {isVotingSupport ? <CheckInSupport topic="voting" /> : (
                        <main className="flex-1 bg-gradient-to-b from-white to-gray-50/50">
                            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><VotingView user={user} /></div>
                        </main>
                    )}
                </div>
                <Footer />
                <WhatsAppSupport floating topic="voting" />
            </div>
        );
    }

    if (user && currentRoute.kind === 'session-questions') {
        if (currentRoute.mode === 'display') {
            return <div className="flex min-h-screen flex-col bg-[#faf9f6] font-sans text-gray-800 antialiased">
                <Navbar user={user} onLogout={handleLogout} activeTab="presenter" onSelectTab={handlePublicTabChange} onSelectAdmin={handleAdminShortcut} />
                {user.role === 'admin'
                    ? <SessionQuestionDisplay sessionId={currentRoute.sessionId} />
                    : <main className="flex-1 p-8"><h1 className="text-xl font-bold">Moderator access required</h1><p className="mt-3">Only administrators can open the projector view.</p><a href="/" className="mt-4 inline-block underline">Back to event</a></main>}
                <Footer showWhatsAppGroup={user.role === 'attendee'} />
            </div>;
        }
        return <div className="flex min-h-screen flex-col bg-gray-50">
            <Navbar user={user} onLogout={handleLogout} activeTab="presenter" onSelectTab={handlePublicTabChange} onSelectAdmin={handleAdminShortcut} />
            <main className="flex-1"><PresenterQuestions /></main>
            <Footer showWhatsAppGroup={user.role === 'attendee'} />
        </div>;
    }

    // Check if we're on a check-in page
    if (currentRoute.kind === 'checkin') {
        const checkinPage = currentRoute.path === '/checkin'
            ? <CheckInSearch />
            : currentRoute.path === '/checkin/support'
                ? <CheckInSupport />
                : currentRoute.path.startsWith('/checkin/confirm/')
                ? <CheckInConfirm />
                : currentRoute.path.startsWith('/checkin/success/')
                    ? <CheckInSuccess />
                    : null;

        if (checkinPage) {
            return (
                <div className="min-h-screen bg-white text-gray-800 flex flex-col font-sans antialiased">
                    <Navbar
                        user={user}
                        onLogout={handleLogout}
                        activeTab={currentRoute.path === '/checkin/support' ? 'support' : ''}
                        supportHref="/checkin/support"
                        onSelectTab={handlePublicTabChange}
                        onSelectAdmin={handleAdminShortcut}
                    />
                    <div className="checkin-site-content flex flex-1 flex-col">
                        {checkinPage}
                    </div>
                    <Footer showWhatsAppGroup={user?.role === 'attendee'} />
                    <WhatsAppSupport floating />
                </div>
            );
        }
    }

    // --- RENDERING ROUTER ---

    if (!authBootstrapComplete) {
        return (
            <div className="min-h-screen bg-[#FAF9F6] text-gray-800 flex items-center justify-center font-sans antialiased">
                <div className="text-center space-y-3">
                    <ShieldCheck className="mx-auto h-10 w-10 animate-pulse text-[#B8922A]" />
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-[#8B6914]">Loading secure session</p>
                </div>
            </div>
        );
    }

    if (user?.role === 'super_admin') {
        return <Suspense fallback={<div className="p-8 text-center">Loading super admin portal...</div>}>
            <SuperAdminPortal user={user} onLogout={handleLogout} />
        </Suspense>;
    }

    if (currentRoute.kind === 'super-admin' && user) {
        return <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-center">
            <div><h1 className="text-xl font-bold">Super admin access required</h1><p className="mt-2 text-sm text-gray-600">This account cannot open the super admin portal.</p><button type="button" onClick={() => navigateTo('/')} className="mt-4 rounded-lg bg-[#1A1A1A] px-4 py-2 text-sm font-bold text-white">Return to voting</button></div>
        </main>;
    }

    if (currentRoute.kind === 'voter-registration' && currentRoute.path === '/voter-registration/support') {
        return (
            <div className="min-h-screen bg-[#FAF9F6] text-gray-800 flex flex-col font-sans antialiased">
                <Navbar
                    user={user}
                    onLogout={handleLogout}
                    activeTab={currentRoute.path === '/voter-registration/support' ? 'support' : 'voting'}
                    supportHref="/voter-registration/support"
                    supportLabel="Voting support"
                    onSelectTab={handlePublicTabChange}
                    onSelectAdmin={handleAdminShortcut}
                />
                <div className="checkin-site-content flex flex-1 flex-col bg-gradient-to-b from-white to-gray-50/50">
                    <CheckInSupport topic="voting" />
                </div>
                <Footer showWhatsAppGroup={user?.role === 'attendee'} />
                <WhatsAppSupport floating topic="voting" />
            </div>
        );
    }

    const isLoginPage = !user && currentRoute.kind !== 'admin';

    return (
        <div className="min-h-screen bg-[#FAF9F6] text-gray-800 flex flex-col font-sans antialiased">
            {/* Dynamic Header Navbar */}
            {!isLoginPage && <Navbar
                user={user}
                onLogout={handleLogout}
                activeTab={currentTab}
                supportHref={user?.role === 'admin' || (currentRoute.kind === 'app' && activeTab === 'voting') ? '/voter-registration/support' : undefined}
                supportLabel="Voting support"
                onSelectTab={handlePublicTabChange}
                onSelectAdmin={handleAdminShortcut}
            />}

            {/* Main Core View Area */}
            <main className={isLoginPage ? 'flex flex-1 bg-sky-100' : 'flex-1 bg-gradient-to-b from-white to-gray-50/50'}>

                {isLoginPage ? (
                    /* --- LOGIN VIEW SCREEN --- */
                    <div className="relative isolate flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-sky-100 px-4 py-8 sm:px-8 animate-fadeIn">
                        <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${loginBuildingImage})` }} />
                        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-white/30" />
                        <div aria-hidden="true" className="absolute -right-24 -top-44 hidden h-[135%] w-2/5 rotate-[37deg] bg-white/25 lg:block" />
                        <div aria-hidden="true" className="pointer-events-none absolute -right-10 bottom-0 hidden w-[410px] flex-col gap-1.5 overflow-hidden opacity-80 lg:flex">
                            <div className="flex translate-x-[285px] gap-1.5"><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#dedede]/75" /></div>
                            <div className="flex translate-x-[215px] gap-1.5"><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#ecd19f]/80" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#dfdfdf]/70" /></div>
                            <div className="flex translate-x-[145px] gap-1.5"><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#d9d9d9]/75" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#e1e1e1]/75" /></div>
                            <div className="flex translate-x-[75px] gap-1.5"><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#e9e0d0]/75" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#d9d9d9]/75" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#e4e4e4]/75" /></div>
                            <div className="flex gap-1.5"><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#d9d9d9]/75" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#dedede]/75" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#e9e0d0]/75" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#d9d9d9]/75" /></div>
                            <div className="flex translate-x-[55px] gap-1.5"><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#e2e2e2]/75" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#dedede]/75" /><span className="h-9 w-28 shrink-0 rounded-[4px] bg-[#e3e3e3]/75" /></div>
                        </div>
                        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[#f97316]" />
                        <section aria-label="Board election information" className="absolute right-[5%] top-[42%] hidden w-[300px] -translate-y-1/2 text-slate-900 xl:block">
                            <p className="inline-flex items-center gap-2 rounded-full border border-[#b45309]/20 bg-white/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#92400e] backdrop-blur-sm">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#ea580c]" /> 2026 Board Elections
                            </p>
                            <h2 className="mt-5 text-[30px] font-extrabold leading-[1.12] tracking-tight text-slate-950">Your voice on the Board.</h2>
                            <div className="mt-4 h-1 w-12 rounded-full bg-[#f97316]" />
                            <p className="mt-4 text-[13px] font-medium leading-relaxed text-slate-700">Electing three representatives to serve on the Board:</p>
                            <div className="mt-4 space-y-2 text-xs font-semibold text-slate-800">
                                <div className="flex items-center gap-3 border-b border-slate-500/20 pb-2"><span className="text-[#c2410c]">01</span> Employee Representative</div>
                                <div className="flex items-center gap-3 border-b border-slate-500/20 pb-2"><span className="text-[#c2410c]">02</span> CIFOZ Employer Representative</div>
                                <div className="flex items-center gap-3"><span className="text-[#c2410c]">03</span> ZBCA Employer Representative</div>
                            </div>
                        </section>
                        <div className="relative z-10 w-full max-w-[360px] space-y-3 rounded-2xl border border-white/80 bg-white/95 p-5 shadow-[0_24px_55px_rgba(15,23,42,0.22)] backdrop-blur-sm sm:p-6">

                            {/* Login header details */}
                            <div className="text-center">
                                <div className="mx-auto flex w-[140px] items-center justify-center">
                                    <img
                                        src={logo}
                                        alt="CIPF logo"
                                        width="140"
                                        height="58"
                                        className="block h-auto w-full object-contain"
                                    />
                                </div>
                                <div className="my-2 h-px w-full bg-gradient-to-r from-transparent via-[#f97316] to-transparent" />
                                <h1 className="text-lg font-bold tracking-tight text-[#252525]">{loginMode === 'member' ? 'Member Voting' : 'Sign In'}</h1>
                                <p className="mt-0.5 text-xs text-slate-700">{loginMode === 'member' ? 'Use your registered voter identifier' : 'Access your account to continue'}</p>
                            </div>

                            {(loginNotice || loginError) && (
                                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-700">
                                    {loginNotice || loginError}
                                </div>
                            )}

                            <form onSubmit={handleLoginSubmit} className="space-y-2">
                                {loginMode === 'member' ? (
                                    <div>
                                        <label htmlFor="member-identifier" className="sr-only">Voter identifier</label>
                                        <div className="relative">
                                            <UserIcon aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                            <input
                                                type="text"
                                                required
                                                id="member-identifier"
                                                autoComplete="off"
                                                value={memberIdentifier}
                                                onChange={(e) => setMemberIdentifier(e.target.value)}
                                                placeholder="Voter identifier"
                                                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white/85 py-2 pl-12 pr-4 text-xs text-slate-900 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
                                            />
                                        </div>
                                        <p className="mt-1.5 text-[11px] text-slate-700">Enter the identifier listed on the election register.</p>
                                    </div>
                                ) : (<>
                                <div className="relative">
                                    <label htmlFor="login-email" className="sr-only">Email address</label>
                                    <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                                    <input
                                        type="email"
                                        required
                                        id="login-email"
                                        autoComplete="username"
                                        value={loginEmail}
                                        onChange={(e) => setLoginEmail(e.target.value)}
                                        placeholder="Email address"
                                        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white/85 py-2 pl-12 pr-4 text-xs text-slate-900 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="login-password" className="sr-only">Password</label>
                                    <div className="relative">
                                        <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                                        <input
                                            type={showLoginPassword ? 'text' : 'password'}
                                            required
                                            id="login-password"
                                            autoComplete="current-password"
                                            value={loginPassword}
                                            onChange={(e) => setLoginPassword(e.target.value)}
                                            placeholder="Password"
                                            className="min-h-10 w-full rounded-lg border border-slate-300 bg-white/85 py-2 pl-12 pr-12 text-xs text-slate-900 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowLoginPassword(current => !current)}
                                            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-slate-500 transition hover:text-[#ea580c]"
                                            aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Remember Me Option */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-800">
                                    <label className="flex cursor-pointer select-none items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                            className="h-4 w-4 accent-[#f97316]"
                                        />
                                        Remember credentials
                                    </label>
                                    <button type="button" id="link-forgot-pwd" onClick={handleForgotPasswordClick} className="font-medium text-[#ea580c] hover:underline">Forgot? Get Help</button>
                                </div>
                                </>)}

                                <div className="pt-1">
                                    <button
                                        type="submit"
                                        id="btn-login-submit"
                                        disabled={loginLoading}
                                        className="min-h-10 w-full rounded-lg bg-[#282828] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316] disabled:bg-slate-300"
                                    >
                                        {loginLoading ? 'Signing in...' : loginMode === 'member' ? 'Open my ballot' : 'Sign in'}
                                    </button>
                                </div>
                            </form>
                            <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600" aria-hidden="true">
                                <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
                            </div>
                            <button type="button" onClick={() => { setLoginMode(current => current === 'member' ? 'account' : 'member'); setLoginError(''); setLoginNotice(''); }}
                                className="min-h-10 w-full rounded-lg border-2 border-[#f97316] bg-white/85 px-4 py-2 text-xs font-semibold text-[#c2410c] transition-colors hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316]">
                                {loginMode === 'member' ? 'Admin sign in' : 'Member voting sign in'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* --- AUTHENTICATED WORKSPACE --- */
                    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

                        {/* 1. HOME VIEW */}
                        {currentRoute.kind === 'app' && activeTab === 'home' && (
                            <div className="space-y-12 animate-fadeIn col-span-full">

                                {/* Visual Hero Block */}
                                <div
                                    className="relative rounded-3xl overflow-hidden shadow-xl bg-cover bg-center h-80 sm:h-96 md:h-[450px] flex items-center"
                                    style={{ backgroundImage: `url(${fallsHeroImage})` }}
                                >
                                    <div className="relative z-10 p-6 sm:p-12 max-w-2xl text-white space-y-3 [text-shadow:0_2px_14px_rgba(0,0,0,0.65)]">
                                        <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-white leading-tight uppercase tracking-tight">
                                           Welcome To Strategic Marketing & Business Growth Indaba
                                        </h1>
                                        <p className="text-xs sm:text-sm font-semibold text-[#FFD700] italic leading-relaxed">
                                            Theme Statement: "Marketing For Competitive Growth: Innovation, Inclusive Markets & Sustainable Value"
                                        </p>
                                        <p className="text-xs text-white leading-relaxed font-bold max-w-lg drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                                            October 19–22, 2026 &bull; A premier professional development gathering for marketing and business leaders, combining world-class learning with high-value peer networking.
                                        </p>
                                        <div className="flex items-center gap-2 text-[10px] text-white font-extrabold uppercase tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                                            <MapPin className="h-4.5 w-4.5 text-[#B8922A]" /> Safari Lodge · Victoria Falls
                                        </div>
                                    </div>
                                </div>

                                {/* Slideshow image slider carousel */}
                                <div className="space-y-4">
                                    <div className="border-b border-gray-200 pb-3 flex justify-between items-end">
                                        <div>
                                            <h2 className="text-sm font-black uppercase text-gray-900 tracking-wider">Highlight Showcase Slider</h2>
                                            <p className="text-[10px] text-gray-500 font-bold">Discover beauties of the Safari lodge, Victoria falls, and previous editions.</p>
                                        </div>
                                    </div>
                                    <Carousel images={carouselImages} />
                                </div>

                                {/* Welcome note from key personnel */}
                                <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm space-y-6">
                                    <div className="border-b border-gray-100 pb-4">
                                        <h3 className="text-xs font-black uppercase tracking-widest text-[#8B6914]">Event Overview</h3>
                                        <p className="text-lg font-black text-gray-900 mt-1 leading-tight">Strategic Marketing & Business Growth Indaba and Expo</p>
                                        <p className="mt-3 max-w-5xl text-xs font-semibold leading-relaxed text-gray-600">
                                            The 18th Annual Marketers Convention brings together business development executives, marketing professionals,
                                            industry leaders, and innovators to share insights, strategies, and trends shaping business growth.
                                            The Indaba fosters networking, collaboration, and the exchange of ideas that advance competitive and sustainable businesses.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-gray-650 leading-relaxed">

                                        {/* For Business Leaders */}
                                        <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-gray-150 space-y-2 font-medium">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1A1A1A] text-[#FFD700] font-black text-[10px]">
                        <Target className="h-4 w-4" />
                      </span>
                                            <p className="font-extrabold text-gray-900 uppercase tracking-wide text-[11px] pt-1">For Business Leaders</p>
                                            <p className="text-gray-600">
                                                Built for CEOs, entrepreneurs, brand managers, and decision makers seeking growth-focused marketing strategies.
                                            </p>
                                        </div>

                                        {/* For Marketing Professionals */}
                                        <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-gray-150 space-y-2 font-medium">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1A1A1A] text-[#FFD700] font-black text-[10px]">
                        <GraduationCap size={18}/>
                      </span>
                                            <p className="font-extrabold text-gray-900 uppercase tracking-wide text-[11px] pt-1">For Marketing Professionals</p>
                                            <p className="text-gray-600">
                                                Designed for digital marketers, media practitioners, communication specialists, and agency teams.
                                            </p>
                                        </div>

                                        {/* For Policy & Academic Voices */}
                                        <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-gray-150 space-y-2 font-medium">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1A1A1A] text-[#FFD700] font-black text-[10px]">
                        <Users size={18} />
                      </span>
                                            <p className="font-extrabold text-gray-900 uppercase tracking-wide text-[11px] pt-1">For Policy & Academic Voices</p>
                                            <p className="text-gray-600">
                                                Welcoming regulators, policy makers, academics, and researchers shaping the future of marketing.
                                            </p>
                                        </div>

                                    </div>
                                </div>

                                {/* Benefits section */}
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-widest">Event Objectives</h3>
                                        <p className="text-xl font-black text-gray-900 leading-tight mt-1">What the Indaba is designed to achieve.</p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { icon: <StarIcon size={18} />, t: 'Knowledge Sharing', d: 'Learn the latest marketing trends, tools, technologies, and business growth strategies from industry experts.' },
                                            { icon: <Globe size={18}/>, t: 'Networking Opportunities', d: 'Connect with marketing professionals, business leaders, entrepreneurs, regulators, and policy makers.' },
                                            { icon: <Briefcase size={18}/>, t: 'Skill Development', d: 'Build practical marketing capabilities through workshops, sessions, and applied discussions.' },
                                            { icon: <ChartIcon size={18}/> , t: 'Innovation Showcase', d: 'Discover emerging trends and innovative solutions transforming modern marketing practice.' }
                                        ].map((card, i) => (
                                            <div
                                                key={i}
                                                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:border-[#B8922A]/40 hover:-translate-y-1 transition-all duration-300 space-y-2"
                                                id={`benefit-card-${i}`}
                                            >
                                                <span className="text-2xl">{card.icon}</span>
                                                <h4 className="font-extrabold text-gray-950 text-xs sm:text-sm tracking-tight">{card.t}</h4>
                                                <p className="text-xs text-gray-500 font-semibold leading-relaxed">{card.d}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* 2. PROGRAMME VIEW */}
                        {user && currentRoute.kind === 'app' && activeTab === 'program' && <ProgramView user={user} />}

                        {/* 2B. LIVE Q&A VIEW */}
                        {user && currentRoute.kind === 'app' && activeTab === 'qa' && <QAView user={user} />}
                        {user && currentRoute.kind === 'app' && activeTab === 'voting' && <VotingView user={user} />}

                        {user && currentRoute.kind === 'qa-results' && <QAResultsView questionId={currentRoute.questionId} />}
                        {user && currentRoute.kind === 'election-results' && <ElectionResultsView />}

                        {/* 3. SPEAKERS & FACILITATORS */}
                        {user && currentRoute.kind === 'app' && activeTab === 'speakers2026' && <SpeakerView user={user} />}

                        {/* 4. ATTENDEES LIST - NEW PAGE */}
                        {currentRoute.kind === 'app' && activeTab === 'attendees' && <PublicAttendees />}

                        {/* 5. WHAT TO WEAR PAGE */}
                        {currentRoute.kind === 'app' && activeTab === 'wear' && <WhatToWear />}

                        {/* 6. TAMARIND RESORT VENUE PAGE */}
                        {currentRoute.kind === 'app' && activeTab === 'venue' && (
                            <div className="space-y-8 animate-fadeIn col-span-full">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                        <MapPin className="h-5.5 w-5.5 text-[#B8922A]" /> Tamarind Resort, Kariba
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
                                        A newly refurbished luxury lakeside resort offering pristine accommodations, majestic river vistas &amp; exceptional academic setups.
                                    </p>
                                </div>

                                {/* Venue Grid display with mock visual cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-semibold text-xs leading-relaxed text-gray-600">

                                    {/* Overview */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-2">
                                        <h3 className="font-extrabold text-xs text-gray-900 uppercase tracking-wide flex items-center gap-2"><Building2 className="h-4 w-4" /> Overview</h3>
                                        <p>
                                            Tamarind Resort sits majestically directly on the shores of Lake Kariba, offering awe-inspiring views, sub-tropical gardens, newly refurbished timber architectures, and warm Zimbabwean hospitality.
                                        </p>
                                    </div>

                                    {/* Accommodation */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-2">
                                        <h3 className="font-extrabold text-xs text-gray-900 uppercase tracking-wide flex items-center gap-2"><Bed className="h-4 w-4" /> Bedrooms &amp; Comforts</h3>
                                        <p>
                                            Refurbished luxury King Bedrooms featuring customized timber finishes, therapeutic posturepedic beds, en-suite marble finish master bathrooms, freestanding walk-in glass shower matrices and automated cooling systems.
                                        </p>
                                    </div>

                                    {/* Conference facilities */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-2">
                                        <h3 className="font-extrabold text-xs text-gray-900 uppercase tracking-wide flex items-center gap-2"><Tv className="h-4 w-4" /> Academic Space Facilities</h3>
                                        <p>
                                            The Main Seminar Foyer, spacious Breakout pods, and traditional design lakeside thatch CBR areas. Outfits incorporate high Definition speaker monitors, widescreen projectors, and multi-node Wi-Fi arrays.
                                        </p>
                                    </div>

                                    {/* Amenities Bullets */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                                        <h3 className="font-extrabold text-xs text-gray-900 uppercase tracking-wide flex items-center gap-2"><Star className="h-4 w-4" /> Deluxe Amenities</h3>
                                        <ul className="grid grid-cols-2 gap-2 text-xs font-bold text-gray-700">
                                            <li><Sunset className="h-3 w-3 inline mr-1" /> Lakeview Sunset Pit</li>
                                            <li><Waves className="h-3 w-3 inline mr-1" /> Open Horizon Pool</li>
                                            <li><Bath size={14} className="inline mr-1" /> Designer En-Suites</li>
                                            <li><Utensils className="h-3 w-3 inline mr-1" /> Dual Dining Deck</li>
                                            <li><Shield size={14} className="inline mr-1" /> Secured Event Wi-Fi</li>
                                            <li><Car size={14} className="inline mr-1" /> Secure Shuttle Transits</li>
                                        </ul>
                                    </div>

                                </div>

                                {/* Embed Map section */}
                                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
                                    <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-widest pl-1">Resort Physical Location</h3>
                                    <div className="rounded-2xl overflow-hidden border border-gray-200 h-64 md:h-80 relative bg-gray-50 flex items-center justify-center">
                                        <iframe
                                            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15233.155767228833!2d28.805367679844075!3d-16.516016335198423!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x193feb1279fdfeeb%3A0x6d8591efac0cb6d8!2sKariba!5e0!3m2!1sen!2szw!4v1700000000000!5m2!1sen!2szw"
                                            className="absolute inset-0 w-full h-full border-none"
                                            allowFullScreen={true}
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                        />
                                    </div>
                                </div>

                            </div>
                        )}
                        {/* 7. LAKESIDE ADVENTURES PAGE */}
                        {currentRoute.kind === 'app' && activeTab === 'adventures' && (
                            <div className="space-y-8 animate-fadeIn col-span-full">
                                {/* Header with Adventures title and Photo Gallery side-by-side */}
                                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                                    {/* Left side: Adventures title */}
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                            <Compass className="h-5.5 w-5.5 text-[#B8922A]" /> Event Activities
                                        </h2>
                                        <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
                                            Explore curated event activities and experiences selected for attendees.
                                        </p>
                                    </div>

                                </div>

                                {/* Adventures Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 font-semibold text-xs leading-relaxed text-gray-600">
                                    {adventures.map((activity) => (
                                        <div key={activity.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full justify-between">
                                            <div className="h-40 bg-[#FAF8F5] flex items-center justify-center overflow-hidden">
                                                {activity.imageUrl ? (
                                                    <img
                                                        src={activity.imageUrl}
                                                        alt={activity.title}
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <Compass className="h-10 w-10 text-[#B8922A]" />
                                                )}
                                            </div>
                                            <div className="p-4 space-y-1.5">
                                                <h4 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
                                                    <Compass className="h-4 w-4" /> {activity.title}
                                                </h4>
                                                <p className="text-gray-600 leading-relaxed">
                                                    {activity.description}
                                                </p>
                                            </div>
                                            <div className="p-4 border-t border-gray-150 text-[10px] text-gray-400 font-extrabold uppercase tracking-wide flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> Event Activity
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* 8. SPONSORS & TESTIMONIALS PAGE */}
                        {currentRoute.kind === 'app' && activeTab === 'testimonials' && (
                            <div className="space-y-12 animate-fadeIn col-span-full">

                                <div>
                                    <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                        <Compass className="h-5.5 w-5.5 text-[#B8922A]" /> Valued Sponsors &amp; Dynamic Alumni
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
                                        Celebrating cumulative partnerships with SADC's peak corporate organizations, parastatals, and banks.
                                    </p>
                                </div>

                                {/* Sponsors section */}
                                <div className="space-y-6">
                                    <div className="border-b border-gray-200 pb-3 flex justify-between items-end">
                                        <div>
                                            <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider flex items-center gap-2"><Award className="h-4 w-4" /> Our Valued Sponsors</h3>
                                            <p className="text-[10px] text-gray-400 font-bold">Event sponsors, exhibitors, and technology partners supporting the Indaba.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-xs text-gray-650 font-semibold leading-normal">
                                        {sponsors.map(sp => (
                                            <div key={sp.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3 flex flex-col justify-between hover:shadow-md transition-shadow" id={`sponsor-card-${sp.id}`}>
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl  text-white text-xl font-bold shadow-sm overflow-hidden">
                                                            {sp.logoUrl?.startsWith('/uploads/') ? (
                                                                <img
                                                                    src={sp.logoUrl}
                                                                    alt={sp.name}
                                                                    className="h-full w-full object-cover"
                                                                    onError={(e) => {
                                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                                        (e.target as HTMLImageElement).parentElement!.innerHTML = '<Building2 className="h-6 w-6" />';
                                                                    }}
                                                                />
                                                            ) : (
                                                                <Building2 className="h-6 w-6" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-gray-900 leading-tight">{sp.name}</p>
                                                            <p className="text-[9px] font-black uppercase text-[#8B6914] tracking-widest mt-0.5">{sp.durationLabel}</p>
                                                        </div>
                                                        {getSponsorCategoryIcon(sp.tier)}
                                                    </div>
                                                    <p className="text-gray-550 leading-relaxed font-semibold">{sp.description}</p>
                                                </div>

                                                <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400 font-extrabold uppercase">
                                                    <span>Verified sponsor</span>
                                                    <a href={sp.website} target="_blank" rel="noreferrer" className="text-[#8B6914] hover:text-amber-500 flex items-center gap-1">
                                                        <ExternalLink className="h-3 w-3" /> Visit site
                                                    </a>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Alumni Testimonials Slider Carousel */}
                                {testimonials.length > 0 && (
                                    <div className="bg-[#1A1A1A] rounded-3xl border border-[#B8922A]/20 p-8 text-white relative shadow-xl">
                    <span className="inline-flex items-center gap-1 rounded bg-[#B8922A] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-black mb-4">
                      <Quote className="h-3 w-3" /> Voices from Our Alumni
                    </span>

                                        <div className="space-y-4 max-w-4xl" id="testimonial-slider">
                                            <p className="text-xs sm:text-sm font-semibold italic text-gray-200 leading-relaxed">
                                                "{testimonials[currentTestimonialIndex].text}"
                                            </p>

                                            <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
                                                <div className="h-10 w-10 text-xs font-black flex items-center justify-center rounded-full bg-[#B8922A] text-black shrink-0">
                                                    {testimonials[currentTestimonialIndex].photoUrl}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-extrabold text-[#FFD700]">{testimonials[currentTestimonialIndex].name}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold">{testimonials[currentTestimonialIndex].position} &bull; <span className="text-gray-300 font-semibold">{testimonials[currentTestimonialIndex].company}</span></p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="absolute bottom-4 right-6 flex items-center gap-1">
                                            {testimonials.map((_, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setCurrentTestimonialIndex(idx)}
                                                    className={`h-2 rounded-full transition-all duration-300 ${
                                                        idx === currentTestimonialIndex ? 'w-6 bg-[#FFD700]' : 'w-2 bg-gray-600'
                                                    }`}
                                                    title={`Testimonial slide ${idx +1}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Past Attendees Section */}
                                <div className="space-y-6">

                                    <div className="border-b border-gray-200 pb-3">
                                        <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider">Past Cohorts (2024 &amp; 2025)</h3>
                                        <p className="text-[10px] text-gray-400 font-bold">Leading parastatals, financial institutions &amp; media organizations represented.</p>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                        {[
                                            { label: 'Financial Services', icon: <Building2 className="h-5 w-5" /> },
                                            { label: 'Telecommunications', icon: <Phone className="h-5 w-5" /> },
                                            { label: 'Energy & Parastatals', icon: <Zap className="h-5 w-5" /> },
                                            { label: 'Broadcasting & Media', icon: <Tv className="h-5 w-5" /> },
                                            { label: 'Manufacturing', icon: <Package className="h-5 w-5" /> },
                                            { label: 'Healthcare & Insurance', icon: <Heart className="h-5 w-5" /> }
                                        ].map((sec, i) => (
                                            <div key={i} className="bg-white rounded-xl border border-gray-150 p-3 flex flex-col items-center justify-center text-center space-y-1.5 shadow-sm hover:border-[#FFD700] transition-colors">
                                                <div className="text-[#8B6914]">{sec.icon}</div>
                                                <span className="text-[9px] font-extrabold text-gray-900 leading-tight">{sec.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* 9. GALLERY PAGE */}
                        {currentRoute.kind === 'app' && activeTab === 'gallery' && (
                            <div className="space-y-8 animate-fadeIn col-span-full">
                                {user && <EventPhotoAlbums />}

                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                            <ImageIcon className="h-5.5 w-5.5 text-[#B8922A]" /> Previous Editions Gallery
                                        </h2>
                                        <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
                                            "Moments from past events – a glimpse of the energy, learning and camaraderie."
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1 bg-[#F0EDE6] p-1 rounded-xl shrink-0 text-[10px] font-black uppercase tracking-wider text-gray-500">
                                        {[
                                            { id: 'all', label: 'All Years' },
                                            { id: '2024', label: '2024 Cohort' },
                                            { id: '2025', label: '2025 Cohort' },
                                            { id: MARKETERS_CONVENTION_GALLERY_CATEGORY, label: '17th AMC 2025' },
                                            { id: CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY, label: '18th AMC 2026' },
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                onClick={() => setGalleryCategory(tab.id as any)}
                                                className={`px-3 py-1.5 rounded-lg tracking-widest transition-all ${
                                                    galleryCategory === tab.id
                                                        ? 'bg-[#1A1A1A] text-[#FFD700]'
                                                        : 'hover:text-black'
                                                }`}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredGallery.map((img) => (
                                        <div
                                            key={img.id}
                                            onClick={() => setSelectedImage(img)}
                                            className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:border-[#B8922A] transition-all duration-300 flex flex-col justify-between cursor-pointer group"
                                        >
                                            <div className="relative h-44 overflow-hidden bg-gray-100">
                                                <img
                                                    src={img.url}
                                                    alt={img.caption}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                                            </div>
                                            <div className="p-4 space-y-1 bg-white">
                        <span className="inline-flex rounded bg-[#FDF6E3] border border-[#B8922A]/20 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase text-[#8B6914] tracking-widest">
                          {img.category === MARKETERS_CONVENTION_GALLERY_CATEGORY || img.category === CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY ? img.category : `${img.category} EDITION`}
                        </span>
                                                <p className="text-[10px] text-gray-600 font-semibold leading-relaxed line-clamp-2">
                                                    {img.caption}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Lightbox */}
                                {selectedImage && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 sm:p-6 lg:p-8 animate-fadeIn">
                                        <div className="absolute inset-0 cursor-pointer" onClick={() => setSelectedImage(null)} />
                                        <div className="relative z-10 max-w-4xl w-full bg-[#111] rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center">
                                            <div className="w-full bg-black/60 p-4 flex items-center justify-between text-white border-b border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#FFD700]">
                          {selectedImage.category === MARKETERS_CONVENTION_GALLERY_CATEGORY || selectedImage.category === CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY ? selectedImage.category : `${selectedImage.category} Cohort Show`}
                        </span>
                                                <button onClick={() => setSelectedImage(null)} className="p-1 text-gray-400 hover:text-white transition-colors">
                                                    <X className="h-6 w-6" />
                                                </button>
                                            </div>
                                            <div className="relative w-full h-80 sm:h-[480px] bg-black flex items-center justify-center">
                                                <img src={selectedImage.url} alt={selectedImage.caption} className="max-w-full max-h-full object-scale-down" />
                                                <button onClick={() => handleLightboxNav('prev')} className="absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 hover:bg-black/95 border border-white/10 text-white">
                                                    <ChevronLeft className="h-8 w-8" />
                                                </button>
                                                <button onClick={() => handleLightboxNav('next')} className="absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 hover:bg-black/95 border border-white/10 text-white">
                                                    <ChevronRight className="h-8 w-8" />
                                                </button>
                                            </div>
                                            <div className="w-full bg-black p-5 text-gray-300">
                                                <p className="text-xs font-semibold leading-relaxed text-center">{selectedImage.caption}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </div>
                        )}

                        {/* 10. FEEDBACK CHATBOT */}
                        {user && currentRoute.kind === 'app' && activeTab === 'feedback' && (
                            <div className="space-y-6 animate-fadeIn col-span-full">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                        <MessageSquareHeart className="h-5.5 w-5.5 text-[#B8922A]" /> Programme Feedback Desk
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
                                        Chat with our artificial intelligence assistant to share your overall appraisal, Standout sessions, and future suggestions.
                                    </p>
                                </div>
                                <Chatbot user={user} onFeedbackSaved={loadAppData} />
                            </div>
                        )}

                        {/* 11. ADMIN DASHBOARD */}
                        {currentRoute.kind === 'admin' && (
                            <div className="animate-fadeIn col-span-full">
                                <Suspense
                                    fallback={(
                                        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl text-center">
                                            <ShieldCheck className="mx-auto h-10 w-10 animate-pulse text-[#B8922A]" />
                                            <p className="mt-3 text-xs font-black uppercase tracking-[0.24em] text-[#8B6914]">Loading admin module</p>
                                        </div>
                                    )}
                                >
                                    <AdminRoute
                                        user={user}
                                        onUserChange={setUser}
                                        onRefreshCore={loadAppData}
                                        onRequireLogin={handleRequireAdminLogin}
                                        onExit={handleExitAdmin}
                                    />
                                </Suspense>
                            </div>
                        )}

                    </div>
                )}

            </main>

            {!isLoginPage && <Footer showWhatsAppGroup={user?.role === 'attendee'} />}
            {!isLoginPage && currentRoute.kind === 'app' && activeTab === 'voting' && <WhatsAppSupport floating topic="voting" />}
        </div>
    );
}
