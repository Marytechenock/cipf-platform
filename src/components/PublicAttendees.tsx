import React, { useState, useEffect } from 'react';
import { Users, Building2, User, Search } from 'lucide-react';
import { api } from '../lib/api';
import { PublicAttendeeDirectoryEntry } from '../types';

export default function PublicAttendees() {
    const [attendees, setAttendees] = useState<PublicAttendeeDirectoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
            setPage(1);
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        fetchAttendees(page, debouncedSearchTerm);
    }, [page, debouncedSearchTerm]);

    const fetchAttendees = async (pageToLoad: number, query: string) => {
        try {
            setLoading(true);
            setError('');
            const data = await api.getPublicAttendees({
                q: query,
                page: pageToLoad,
                pageSize
            });

            if (data.success) {
                setAttendees(data.attendees);
                setTotal(data.total);
                setHasMore(data.hasMore);
            } else {
                setError('Failed to load attendees');
            }
        } catch (err) {
            console.error('Error fetching attendees:', err);
            setError('Error loading attendee list');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#B8922A] border-t-transparent mx-auto"></div>
                    <p className="text-sm text-gray-500 font-semibold">Loading attendees...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-3">
                    <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                        <Users className="h-8 w-8 text-red-500" />
                    </div>
                    <p className="text-sm text-red-500 font-semibold">{error}</p>
                    <button
                        onClick={() => fetchAttendees(page, debouncedSearchTerm)}
                        className="text-xs font-bold text-[#8B6914] hover:text-amber-500"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fadeIn">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-12 w-12 rounded-xl bg-[#1A1A1A] flex items-center justify-center">
                        <Users className="h-6 w-6 text-[#FFD700]" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Strategic Marketing &amp; Business Growth Indaba</h1>
                        <p className="text-sm text-gray-500 font-semibold">Registered Attendees</p>
                    </div>
                </div>
                <p className="text-xs text-gray-400 font-semibold">
                    {total === 0 ? 'No attendees listed yet' : `${Math.min((page - 1) * pageSize + 1, total)}-${Math.min(page * pageSize, total)} of ${total} attendees listed`}
                </p>
            </div>

            {/* Search Bar */}
            <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    type="text"
                    placeholder="Search by name or organization..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-[#B8922A] focus:outline-none focus:ring-1 focus:ring-[#B8922A] text-sm font-semibold bg-white shadow-sm"
                />
                {searchTerm && (
                    <button
                        onClick={() => setSearchTerm('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Attendee List */}
            {attendees.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                    <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 font-semibold">
                        {debouncedSearchTerm ? 'No attendees match your search' : 'No attendees registered yet'}
                    </p>
                    {debouncedSearchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="mt-2 text-xs font-bold text-[#8B6914] hover:text-amber-500"
                        >
                            Clear search
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-500">
                                    <div className="flex items-center gap-2">
                                        <User className="h-3 w-3" /> Name
                                    </div>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-500">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-3 w-3" /> Organization
                                    </div>
                                </th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                            {attendees.map((attendee) => (
                                <tr
                                    key={attendee.id}
                                    className="hover:bg-gray-50 transition-colors duration-150"
                                >
                                    <td className="px-6 py-3.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {attendee.firstName} {attendee.lastName}
                      </span>
                                    </td>
                                    <td className="px-6 py-3.5">
                      <span className="text-sm font-medium text-gray-600">
                        {attendee.organization}
                      </span>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="mt-4 flex items-center justify-between">
                <button
                    onClick={() => setPage(current => Math.max(1, current - 1))}
                    disabled={page === 1 || loading}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Previous
                </button>
                <p className="text-xs font-semibold text-gray-400">
                    Page {page}
                </p>
                <button
                    onClick={() => setPage(current => current + 1)}
                    disabled={!hasMore || loading}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Next
                </button>
            </div>

        </div>
    );
}
