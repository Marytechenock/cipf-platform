import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import AskSessionQuestion from './sessionQuestions/AskSessionQuestion';
import { Session, User, StudyMaterial } from '../types';
import { Calendar, AlignLeft, ShieldCheck, MapPin, Clock, Edit3, Trash2, CheckCircle2, ChevronDown, ChevronUp, Loader, BookOpen, Download, FileText, File, FileArchive } from 'lucide-react';

interface ProgramViewProps {
  user: User;
}

export default function ProgramView({ user }: ProgramViewProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [category, setCategory] = useState<'Class A' | 'Class B'>('Class B');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadedNotes, setLoadedNotes] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saved'>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Study Materials State
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'study-materials'>('schedule');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Load sessions
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await api.getSessions();
        setSessions(data);

        const defaultExpanded: Record<string, boolean> = {};
        const subset = data.filter(s => s.category === category);
        if (subset[0]) defaultExpanded[subset[0].id] = true;
        if (subset[1]) defaultExpanded[subset[1].id] = true;
        setExpanded(defaultExpanded);

        if (subset[0]) fetchNoteForSession(subset[0].id);
        if (subset[1]) fetchNoteForSession(subset[1].id);

      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [category]);

  // Load study materials when tab is selected
  useEffect(() => {
    if (activeTab === 'study-materials') {
      loadStudyMaterials();
    }
  }, [activeTab]);

  const loadStudyMaterials = async () => {
    setMaterialsLoading(true);
    try {
      const data = await api.getStudyMaterials();
      setStudyMaterials(data.materials || []);
    } catch (error) {
      console.error('Error loading study materials:', error);
    } finally {
      setMaterialsLoading(false);
    }
  };

  const fetchNoteForSession = async (sid: string) => {
    if (loadedNotes[sid] !== undefined) return;
    try {
      const res = await api.getNote(sid);
      setLoadedNotes(prev => ({ ...prev, [sid]: res.note }));
    } catch (e) {
      console.error('Note fetch error:', e);
    }
  };

  const handleToggleExpand = (sid: string) => {
    setExpanded(prev => {
      const next = !prev[sid];
      if (next) {
        fetchNoteForSession(sid);
      }
      return { ...prev, [sid]: next };
    });
  };

  const handleNoteChange = (sid: string, val: string) => {
    setLoadedNotes(prev => ({ ...prev, [sid]: val }));
    setSaveStatus(prev => ({ ...prev, [sid]: 'idle' }));
  };

  const handleSaveNote = async (sid: string) => {
    setIsSaving(prev => ({ ...prev, [sid]: true }));
    try {
      const content = loadedNotes[sid] || '';
      await api.saveNote(sid, content);
      setSaveStatus(prev => ({ ...prev, [sid]: 'saved' }));
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [sid]: 'idle' }));
      }, 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(prev => ({ ...prev, [sid]: false }));
    }
  };

  const handleDeleteNote = async (sid: string) => {
    if (!window.confirm('Are you sure you want to delete your written notes for this session? This action cannot be undone.')) {
      return;
    }
    setIsSaving(prev => ({ ...prev, [sid]: true }));
    try {
      await api.deleteNote(sid);
      setLoadedNotes(prev => ({ ...prev, [sid]: '' }));
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(prev => ({ ...prev, [sid]: false }));
    }
  };

  // Study Materials Handlers - DIRECT DOWNLOAD without opening
  const handleDownload = async (material: StudyMaterial) => {
    setDownloadingId(material.id);
    try {
      // Track the download
      await api.trackStudyMaterialDownload(material.id);

      // Fetch the file
      const response = await fetch(material.fileUrl);

      if (!response.ok) {
        throw new Error('Download failed');
      }

      // Get the blob from response
      const blob = await response.blob();

      // Create object URL
      const url = window.URL.createObjectURL(blob);

      // Create hidden anchor and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = material.fileName;
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Download error:', error);
      // Fallback: Try opening in new tab if direct download fails
      window.open(material.fileUrl, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileExtension = (fileName: string) => {
    return fileName.split('.').pop()?.toUpperCase() || 'PDF';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Get file icon based on extension
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    switch(ext) {
      case 'pdf':
        return <FileText className="h-5 w-5 text-red-500" />;
      case 'doc':
      case 'docx':
        return <FileText className="h-5 w-5 text-blue-500" />;
      case 'ppt':
      case 'pptx':
        return <FileText className="h-5 w-5 text-orange-500" />;
      case 'xls':
      case 'xlsx':
        return <FileText className="h-5 w-5 text-green-500" />;
      case 'zip':
      case 'rar':
        return <FileArchive className="h-5 w-5 text-purple-500" />;
      default:
        return <File className="h-5 w-5 text-gray-500" />;
    }
  };

  if (isLoading) {
    return (
        <div className="flex flex-col h-64 items-center justify-center text-[#B8922A]">
          <Loader className="h-10 w-10 animate-spin mb-2" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Loading Dynamic Program Core...</span>
        </div>
    );
  }

  const filteredSessions = sessions.filter(s => s.category === category);

  const daysMap: Record<number, { label: string; list: Session[] }> = {};
  filteredSessions.forEach(s => {
    if (!daysMap[s.day]) {
      daysMap[s.day] = {
        label: s.dayLabel || `Day ${s.day}`,
        list: []
      };
    }
    daysMap[s.day].list.push(s);
  });

  return (
      <div className="w-full">

        {/* Cohort Category Selection Rails */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-5 mb-8 flex-col sm:flex-row gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Calendar className="h-5.5 w-5.5 text-[#B8922A]" /> Convention Programme
            </h2>
            <p className="text-xs text-gray-500 mt-1 font-semibold">
              View the official 18th Annual Marketers Convention schedule, venues and speaker sessions.
            </p>
          </div>

          <div className="flex bg-[#F0EDE6] p-1 rounded-xl shrink-0 border border-gray-300">
            <button
                onClick={() => setCategory('Class B')}
                id="toggle-class-b"
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                    category === 'Class B'
                        ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md'
                        : 'text-gray-600 hover:text-black'
                }`}
            >
              Class B
            </button>

            <button
                onClick={() => setCategory('Class A')}
                id="toggle-class-a"
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                    category === 'Class A'
                        ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md'
                        : 'text-gray-600 hover:text-black'
                }`}
            >
              Class A
            </button>
          </div>
        </div>

        {/* Tab Navigation - Schedule / Study Materials */}
        <div className="flex gap-2 border-b border-gray-200 mb-6">
          <button
              onClick={() => setActiveTab('schedule')}
              className={`px-4 py-2.5 text-sm font-bold transition-all ${
                  activeTab === 'schedule'
                      ? 'border-b-2 border-[#B8922A] text-[#B8922A]'
                      : 'text-gray-500 hover:text-gray-800'
              }`}
          >
            <Calendar className="h-4 w-4 inline mr-2" />
            Schedule
          </button>
          <button
              onClick={() => setActiveTab('study-materials')}
              className={`px-4 py-2.5 text-sm font-bold transition-all flex items-center gap-2 ${
                  activeTab === 'study-materials'
                      ? 'border-b-2 border-[#B8922A] text-[#B8922A]'
                      : 'text-gray-500 hover:text-gray-800'
              }`}
          >
            <BookOpen className="h-4 w-4" />
            Study Materials
            {studyMaterials.length > 0 && (
                <span className="inline-flex items-center justify-center bg-[#B8922A]/20 text-[#B8922A] text-[10px] font-black rounded-full px-2 py-0.5">
              {studyMaterials.length}
            </span>
            )}
          </button>
        </div>

        {/* Schedule Tab Content */}
        {activeTab === 'schedule' && (
            <div className="space-y-10">
              {Object.keys(daysMap).sort().map((dayKey) => {
                const dayNum = Number(dayKey);
                const { label, list } = daysMap[dayNum];
                const orderedList = [...list];

                return (
                    <div key={dayNum} className="space-y-4">
                      <div className="flex items-center gap-3 border-l-4 border-[#B8922A] pl-3 py-1 bg-[#FDF6E3]/45 rounded-r-lg">
                        <h3 className="text-sm font-black text-[#8B6914] tracking-wider uppercase">
                          {label}
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        {orderedList.map((session) => {
                          const isExpanded = !!expanded[session.id];
                          const noteContent = loadedNotes[session.id] || '';
                          const status = saveStatus[session.id] || 'idle';
                          const saving = !!isSaving[session.id];

                          let typeClass = "border-gray-200 bg-white hover:border-[#B8922A]/40";
                          if (session.type === 'social') {
                            typeClass = "border-amber-200 bg-amber-500/5 hover:border-amber-400/50";
                          } else if (session.type === 'break') {
                            typeClass = "border-gray-100 bg-[#FAF8F5]/80 hover:border-gray-200";
                          }

                          return (
                              <div
                                  key={session.id}
                                  className={`rounded-xl border transition-all duration-200 shadow-sm overflow-hidden ${typeClass}`}
                                  id={`session-card-${session.id}`}
                              >
                                <div
                                    onClick={() => handleToggleExpand(session.id)}
                                    className="p-4 flex items-start justify-between gap-4 cursor-pointer select-none"
                                >
                                  <div className="flex-1 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500">
                                <Clock className="h-3 w-3 text-gray-400" /> {session.time}
                              </span>

                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500">
                                <MapPin className="h-3 w-3 text-[#B8922A]" /> {session.venue}
                              </span>

                                      {session.type === 'social' && (
                                          <span className="h-2 w-2 rounded-full bg-amber-500 uppercase px-2 py-0.5 text-[8px] text-amber-950 font-black tracking-wider shadow">
                                  Networking
                                </span>
                                      )}
                                      {session.type === 'break' && (
                                          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[8px] text-gray-600 font-extrabold uppercase">
                                  Recess
                                </span>
                                      )}
                                    </div>

                                    <h4 className="text-xs sm:text-sm font-extrabold text-[#1a1a1a] leading-snug">
                                      {session.topic}
                                    </h4>

                                    {session.facilitator && (
                                        <p className="text-xs text-gray-500 font-semibold tracking-tight">
                                          Led by: <span className="text-[#8B6914] font-bold">{session.facilitator}</span>
                                        </p>
                                    )}
                                  </div>

                                  <div className="p-1 text-gray-400 hover:text-gray-900 leading-none shrink-0 self-center">
                                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                  </div>
                                </div>

                                {user.role === 'attendee' && (!session.type || session.type === 'session') && (
                                  <div className="px-4 pb-4"><AskSessionQuestion session={session} /></div>
                                )}

                                {isExpanded && (
                                    <div className="border-t border-gray-100 bg-[#FAF8F5]/50 px-4 py-5 space-y-4">
                                      <div className="flex flex-col md:flex-row gap-6">
                                        <div className="flex-1 space-y-3 prose leading-relaxed text-xs text-gray-600 font-semibold">
                                          <p className="font-bold text-gray-700 uppercase tracking-wider text-[10px]">Takeaway instructions:</p>
                                          {session.type === 'break' ? (
                                              <p>This session is a dedicated wellness recess for coffee, dining, and checking emails. Check with colleagues and catch up informally.</p>
                                          ) : session.type === 'social' ? (
                                              <p>Active networking event! Use your "My Notes" textarea to write down contacts, phone numbers, or corporate emails of people you connect with.</p>
                                          ) : (
                                              <p>Listen closely to key strategy frameworks or case lessons from the facilitator. Type down your personal analytical breakthroughs below to preserve on your dashboard.</p>
                                          )}
                                        </div>

                                        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                                          <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#8B6914] flex items-center gap-1.5">
                                              <Edit3 className="h-3.5 w-3.5" /> My Session Notes
                                            </label>

                                            <div className="flex items-center gap-2">
                                              {status === 'saved' && (
                                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 animate-fadeIn">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Notes Logged
                                      </span>
                                              )}

                                              {noteContent.trim().length > 0 && (
                                                  <button
                                                      disabled={saving}
                                                      onClick={() => handleDeleteNote(session.id)}
                                                      className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-all shrink-0"
                                                      title="Clear Note"
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                              )}
                                            </div>
                                          </div>

                                          <textarea
                                              value={noteContent}
                                              onChange={(e) => handleNoteChange(session.id, e.target.value)}
                                              disabled={saving}
                                              id={`note-textarea-${session.id}`}
                                              placeholder="Type your ideas, contacts, action plans or takeaways from this session here..."
                                              className="w-full h-24 rounded-lg border border-gray-300 p-2.5 text-xs font-semibold focus:border-[#B8922A] focus:outline-none focus:ring-1 focus:ring-[#B8922A] resize-none leading-relaxed placeholder:text-gray-400 bg-[#FAFBFB] disabled:bg-gray-50"
                                          />

                                          <div className="flex justify-end">
                                            <button
                                                onClick={() => handleSaveNote(session.id)}
                                                disabled={saving}
                                                id={`note-save-btn-${session.id}`}
                                                className="flex items-center gap-1.5 rounded-lg bg-[#1A1A1A] hover:bg-neutral-800 text-[#FFD700] px-4 py-1.5 text-xs font-extrabold shadow tracking-wide transition-all disabled:bg-gray-200 disabled:text-gray-400"
                                            >
                                              {saving ? 'Saving...' : 'Save Notes'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                )}
                              </div>
                          );
                        })}
                      </div>
                    </div>
                );
              })}
            </div>
        )}

        {/* Study Materials Tab Content - EXACT MATCH to image with DIRECT DOWNLOAD */}
        {activeTab === 'study-materials' && (
            <div className="space-y-2">
              {materialsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#B8922A] border-t-transparent"></div>
                  </div>
              ) : studyMaterials.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                    <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm font-semibold text-gray-400">No study materials available yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Check back soon for course materials.</p>
                  </div>
              ) : (
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
                    {studyMaterials.map((material, index) => (
                        <div
                            key={material.id}
                            className={`flex items-center justify-between p-4 ${
                                index === 0 ? '' : 'border-t border-gray-100'
                            } hover:bg-gray-50/50 transition-colors`}
                        >
                          {/* Left side - File info */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* File Icon */}
                            <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
                              {getFileIcon(material.fileName)}
                            </div>

                            {/* File Info - matches image exactly */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm truncate">
                                {material.title}
                              </p>
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
                                <span className="font-mono">{material.fileName}</span>
                                <span className="text-gray-300">•</span>
                                <span className="font-semibold">{getFileExtension(material.fileName)}</span>
                                <span className="text-gray-300">•</span>
                                <span>{formatFileSize(material.fileSize)}</span>
                                <span className="text-gray-300">•</span>
                                <span>Uploaded: {formatDate(material.uploadDate)}</span>
                                <span className="text-gray-300">•</span>
                                <span>{material.downloads || 0} downloads</span>
                              </div>
                            </div>
                          </div>

                          {/* Download Button - Direct Download */}
                          <button
                              onClick={() => handleDownload(material)}
                              disabled={downloadingId === material.id}
                              className="flex items-center gap-1.5 rounded-lg bg-[#B8922A] hover:bg-[#A67A20] px-4 py-1.5 text-sm font-semibold text-white transition-all duration-200 shadow-sm hover:shadow-md shrink-0 ml-4 disabled:opacity-70 disabled:cursor-not-allowed"
                          >
                            {downloadingId === material.id ? (
                                <>
                                  <Loader className="h-3.5 w-3.5 animate-spin" />
                                  <span className="text-xs">Downloading...</span>
                                </>
                            ) : (
                                <>
                                  <Download className="h-3.5 w-3.5" />
                                  <span>Download</span>
                                </>
                            )}
                          </button>
                        </div>
                    ))}
                  </div>
              )}
            </div>
        )}
      </div>
  );
}
