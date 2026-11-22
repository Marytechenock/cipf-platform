import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Speaker, User } from '../types';
import { Award, Clock, ArrowRight, User as UserIcon, LogIn, ChevronDown, ChevronUp, Loader, Calendar, Building2, Briefcase, Quote, Star, ExternalLink } from 'lucide-react';

interface SpeakerViewProps {
  user: User;
}

export default function SpeakerView({ user }: SpeakerViewProps) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [expandedBio, setExpandedBio] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSpeakers = async () => {
      try {
        const data = await api.getSpeakers();
        setSpeakers(data);

        // Auto expand first speaker biography for a stunning entrance
        if (data[0]) {
          setExpandedBio({ [data[0].id]: true });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSpeakers();
  }, []);

  const handleToggleBio = (id: string) => {
    setExpandedBio(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Helper to get speaker initials
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
        <div className="flex flex-col h-64 items-center justify-center text-[#B8922A]">
          <Loader className="h-10 w-10 animate-spin mb-2" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Loading Speaker List...</span>
        </div>
    );
  }

  return (
      <div className="w-full space-y-8">

        {/* Introduction banner */}
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Award className="h-5.5 w-5.5 text-[#B8922A]" /> Facilitators &amp; Thought Leaders
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
            The Strategic Marketing &amp; Business Growth Indaba and Expo brings together leading minds to share insights, strategies, and trends shaping competitive business growth.
          </p>
        </div>

        {/* Grid of speakers layout - bento style */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {speakers.map((speaker) => {
            const isBioOpen = !!expandedBio[speaker.id];

            return (
                <div
                    key={speaker.id}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                    id={`speaker-card-${speaker.id}`}
                >
                  <div>
                    {/* Header profile section with image support */}
                    <div className="flex gap-4 items-center mb-4">

                      {/* Speaker portrait - supports uploaded images or initials fallback */}
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FDF6E3] to-[#FFF8E7] border-2 border-[#B8922A]/30 font-extrabold text-[#8B6914] text-lg shadow-md overflow-hidden group-hover:border-[#B8922A] transition-all">
                        {speaker.photoUrl?.startsWith('/uploads/') ? (
                            <img
                                src={speaker.photoUrl}
                                alt={speaker.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  // Fallback to initials if image fails to load
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).parentElement!.innerHTML = getInitials(speaker.name);
                                }}
                            />
                        ) : (
                            <span>{speaker.photoUrl && speaker.photoUrl.length <= 3 ? speaker.photoUrl : getInitials(speaker.name)}</span>
                        )}
                      </div>

                      <div className="flex-1">
                        <h3 className="text-sm font-black text-gray-900 leading-tight">
                          {speaker.name}
                        </h3>
                        <p className="text-[11px] text-gray-500 font-bold tracking-tight flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> {speaker.position}
                        </p>
                        <p className="text-[10px] text-[#8B6914] font-black uppercase tracking-wider mt-0.5 flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {speaker.organization}
                        </p>
                      </div>
                    </div>

                    {/* Topic and Time information banner */}
                    <div className="bg-[#FAF8F5] border border-gray-150 rounded-xl p-3.5 space-y-2 mb-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#B8922A] uppercase tracking-wider">
                        <Clock className="h-3.5 w-3.5" /> Speaking Schedule
                      </div>
                      <p className="text-xs font-black text-gray-900 leading-snug flex items-start gap-1">
                        <Quote className="h-3 w-3 text-[#B8922A] shrink-0 mt-0.5" />
                        "{speaker.topic}"
                      </p>
                      <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Time: <span className="text-[#1A1A1A]">{speaker.speakingTime}</span>
                      </p>
                    </div>

                    {/* Speaker Introduction Section - expand for full BIO */}
                    <div className="space-y-2 text-xs text-gray-600 font-semibold leading-relaxed">
                      <p className="line-clamp-3">
                        {speaker.bio}
                      </p>

                      <button
                          onClick={() => handleToggleBio(speaker.id)}
                          className="flex items-center gap-1 text-[10px] font-black uppercase text-[#8B6914] hover:text-amber-600 mt-2 transition-colors self-start"
                      >
                        {isBioOpen ? (
                            <>Read Less Biography <ChevronUp className="h-3.5 w-3.5" /></>
                        ) : (
                            <>Read Full Biography <ChevronDown className="h-3.5 w-3.5" /></>
                        )}
                      </button>

                      {/* Fully expanded biography paragraph */}
                      {isBioOpen && (
                          <div className="pt-3 mt-2 border-t border-gray-100 text-xs text-gray-600 font-medium leading-relaxed bg-gradient-to-r from-[#FFFDF9] to-[#FFFBF5] p-4 rounded-xl animate-fadeIn shadow-inner">
                            <div className="flex gap-2">
                              <Star className="h-3.5 w-3.5 text-[#B8922A] shrink-0 mt-0.5" />
                              <p>{speaker.bio}</p>
                            </div>
                          </div>
                      )}
                    </div>
                  </div>

                  {/* Speaker card foot indicators */}
                  <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <Award className="h-3 w-3" /> Accredited Faculty
                </span>
                    <span className="text-[#8B6914] font-semibold flex items-center gap-0.5">
                  MABI &bull; IMM <ExternalLink className="h-3 w-3" />
                </span>
                  </div>

                </div>
            );
          })}
        </div>

        {/* Empty state if no speakers */}
        {speakers.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
              <UserIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-500">No speakers available at this time.</p>
              <p className="text-xs text-gray-400 mt-1">Please check back later for the updated lineup.</p>
            </div>
        )}

      </div>
  );
}
