import { User } from '../types';
import { KeyRound, LogOut, Settings, Menu, X, HelpCircle, Vote, type LucideIcon } from 'lucide-react';
import React, { useState } from 'react';
import AdminChangePasswordModal from './admin/AdminChangePasswordModal';
import logo from "@/assets/images/logo-1.png";

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onSelectAdmin: () => void;
  supportHref?: string;
  supportLabel?: string;
}

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export default function Navbar({ user, onLogout, activeTab, onSelectTab, onSelectAdmin, supportHref, supportLabel = 'Check-in support' }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const isVotingMember = user?.role === 'member';
  const navItems: NavItem[] = [{ id: 'voting', label: 'Voting', icon: Vote }];
  const visiblePrimaryNavItems = user?.role === 'admin' ? [] : navItems;

  const handleTabClick = (tabId: string) => {
    onSelectTab(tabId);
    setIsOpen(false);
  };

  return (
      <header className="sticky top-0 z-50 w-full border-b border-[#B8922A]/20 bg-[#1A1A1A] text-white shadow-md">
        <div className={`mx-auto flex h-20 max-w-7xl items-center px-4 sm:px-6 lg:px-8 ${isVotingMember ? 'gap-3 lg:gap-5' : 'justify-between'}`}>
          {/* Branding Emblem */}
          <div
              onClick={() => handleTabClick(isVotingMember ? 'voting' : 'home')}
              className="flex shrink-0 cursor-pointer items-center gap-3 active:scale-95 transition-transform"
              id="navbar-brand"
          >
            {/* Custom designed MAZ emblem with gradients */}
            <img
                src={logo}
                alt="Marketers Association Zimbabwe Logo"
                className={`h-12 object-contain sm:h-14 sm:w-60 ${isVotingMember ? 'w-32 sm:w-48' : 'w-48'}`}
            />
          </div>

          {/* Desktop Navigation Links */}
          <nav aria-label="Main navigation" className={`hidden lg:flex items-center gap-1 ${isVotingMember ? 'ml-auto' : ''}`}>
            {user && visiblePrimaryNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                  <button
                      key={item.id}
                      id={`tab-link-${item.id}`}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => handleTabClick(item.id)}
                      className={`flex items-center gap-2 text-xs font-semibold tracking-wide transition-all ${isVotingMember ? 'min-h-10 rounded-lg px-4 py-2' : 'rounded-md px-3 py-1.5'} ${
                          isActive
                              ? 'bg-[#B8922A] text-[#1A1A1A] font-bold shadow'
                              : 'text-gray-300 hover:bg-[#2C2C2C] hover:text-white'
                      }`}
                  >
                    <Vote className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </button>
              );
            })}


          </nav>

          {/* User State Controls */}
          <div className={`flex items-center ${isVotingMember ? 'ml-auto gap-2 lg:ml-0 lg:gap-4' : 'gap-3'}`}>
            {user?.role === 'admin' && (
                <button
                    id="tab-link-voting"
                    type="button"
                    onClick={() => handleTabClick('voting')}
                    aria-current={activeTab === 'voting' ? 'page' : undefined}
                    className={`hidden min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8922A] lg:inline-flex ${activeTab === 'voting' ? 'bg-[#B8922A] text-[#1A1A1A]' : 'text-gray-300 hover:bg-[#2C2C2C] hover:text-white'}`}
                >
                  <Vote className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Voting</span>
                </button>
            )}
            {supportHref && (
                <a
                    href={supportHref}
                    aria-label={supportLabel}
                    aria-current={activeTab === 'support' ? 'page' : undefined}
                    className={`${user?.role === 'admin' ? 'hidden lg:inline-flex' : 'inline-flex'} min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8922A] ${isVotingMember ? 'border border-white/10' : ''} ${activeTab === 'support' ? 'bg-[#B8922A] text-[#1A1A1A]' : 'text-gray-300 hover:bg-[#2C2C2C] hover:text-white'}`}
                >
                  <HelpCircle className="h-4 w-4" aria-hidden="true" />
                  <span className={user ? 'hidden sm:inline' : undefined}>Support</span>
                </a>
            )}
            {user ? (
                <div className={`flex min-w-0 items-center ${isVotingMember ? 'gap-3 md:border-l md:border-white/10 md:pl-4' : 'gap-2 lg:gap-3 lg:border-l lg:border-white/15 lg:pl-4'}`}>
                  {isVotingMember && <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#B8922A]/30 bg-[#B8922A]/10 text-xs font-bold text-[#D4B04C] md:flex" aria-hidden="true">{user.firstName.charAt(0)}{user.lastName.charAt(0)}</span>}
                  {user.role === 'admin' && <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#B8922A]/40 bg-[#B8922A]/15 text-xs font-bold text-[#F3D681] lg:flex" aria-hidden="true">{user.firstName.charAt(0)}{user.lastName.charAt(0)}</span>}
                  {/* Profile Card component */}
                  <div className={`hidden min-w-0 ${user.role === 'admin' ? 'lg:block' : 'md:block'} ${isVotingMember ? 'text-left' : 'text-right'} ${user.role === 'admin' ? 'text-left' : ''}`}>
                    <span className="block max-w-44 truncate text-sm font-semibold text-white" id="navbar-welcome" title={`${user.firstName} ${user.lastName}`}>
                      {user.role === 'admin' ? `${user.firstName} ${user.lastName}` : `Welcome, ${user.firstName} ${user.lastName}`}
                    </span>
                    <span className="block text-[10px] font-medium text-[#DCC06A]">
                  {user.role === 'admin' ? 'Administrator' : user.role === 'member' ? 'Voting Member' : 'Accredited Attendee'}
                    </span>
                  </div>

                  {/* Account actions */}
                  {user.role === 'admin' && (
                      <button type="button" onClick={() => setShowChangePassword(true)}
                          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-[#E8D08C] transition-colors hover:border-[#B8922A]/70 hover:bg-[#B8922A]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8922A] lg:inline-flex"
                          title="Change password" aria-label="Change password">
                        <KeyRound className="h-5 w-5" aria-hidden="true" />
                      </button>
                  )}
                  {user.role === 'admin' && (
                      <button
                          type="button"
                          id="tab-link-admin"
                          onClick={() => {
                            onSelectAdmin();
                            setIsOpen(false);
                          }}
                          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-gray-200 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8922A] lg:inline-flex"
                          title="Admin dashboard" aria-label="Admin dashboard"
                      >
                        <Settings className="h-5 w-5" aria-hidden="true" />
                      </button>
                  )}

                  {/* Logout Button */}
                  <button
                      onClick={onLogout}
                      id="btn-logout"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors border ${isVotingMember ? 'border-white/10 text-gray-400 hover:border-red-900/40 hover:bg-red-950/40 hover:text-red-300' : 'border-red-900/40 bg-red-950/30 text-red-300 hover:border-red-700/60 hover:bg-red-950/70'}`}
                      title="Sign Out"
                      aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
            ) : (
                <div className="hidden" />
            )}

            {/* Handheld Menu Controls */}
            {user && (
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    id="mobile-menu-toggle"
                    aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={isOpen}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-[#2C2C2C] hover:text-white lg:hidden"
                >
                  {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
            )}
          </div>
        </div>

        {/* Handheld Side Menu Panel */}
        {isOpen && user && (
            <div className="bg-[#1A1A1A] px-4 pt-2 pb-4 shadow-inner lg:hidden border-t border-[#B8922A]/10 animate-fadeIn">
              {/* Mobile Profile badge info */}
              <div className="mb-4 border-b border-gray-800 pb-3">
                <div className="text-sm font-bold text-white">
                  Welcome, {user.firstName} {user.lastName}
                </div>
                <div className="text-[10px] text-[#FFD700] mt-0.5 font-semibold">
                  {isVotingMember
                      ? ['Voting Member', user.organization].filter(Boolean).join(' · ')
                      : user.organization
                          ? [user.position, user.organization].filter(Boolean).join(' · ')
                          : user.role === 'admin' ? 'Admin Role' : 'Accredited Delegate'}
                </div>
              </div>

              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                      <button
                          key={item.id}
                          id={`mobile-tab-link-${item.id}`}
                          onClick={() => handleTabClick(item.id)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                              isActive
                                  ? 'bg-[#B8922A] text-[#1A1A1A] font-bold shadow'
                                  : 'text-gray-300 hover:bg-[#2C2C2C] hover:text-white'
                          }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </button>
                  );
                })}
                {user.role === 'admin' && supportHref && (
                    <a
                        href={supportHref}
                        aria-current={activeTab === 'support' ? 'page' : undefined}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${activeTab === 'support' ? 'bg-[#B8922A] text-[#1A1A1A] font-bold shadow' : 'text-gray-300 hover:bg-[#2C2C2C] hover:text-white'}`}
                    >
                      <HelpCircle className="h-4 w-4 shrink-0" /> Support
                    </a>
                )}
                {user.role === 'admin' && (
                    <button type="button" onClick={() => { setShowChangePassword(true); setIsOpen(false); }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-200 hover:bg-[#2C2C2C] hover:text-white">
                      <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" /> Change password
                    </button>
                )}
                {user.role === 'admin' && (
                    <button
                        id="mobile-tab-link-admin"
                        onClick={() => {
                          onSelectAdmin();
                          setIsOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-bold text-white transition-all hover:text-[#FFD700]"
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      Admin Voting Controls
                    </button>
                )}
              </div>
            </div>
        )}
        {showChangePassword && user?.role === 'admin' && <AdminChangePasswordModal onClose={() => setShowChangePassword(false)} onPasswordChanged={onLogout} />}
      </header>
  );
}
