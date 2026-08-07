import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { Plus, Search, Pencil, Trash2, X, Megaphone, Send, Archive, AlertCircle } from "lucide-react";
import { useToast } from "../hooks/useToast";
import {
  announcementService,
  type ManagedAnnouncement,
  type AnnouncementCategory,
  type AnnouncementPriority,
  type AnnouncementStatus,
} from "../services/announcementService";
import { CategoryBadge, PriorityBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchBar } from "../components/ui/SearchBar";
import { formatDate } from "../lib/utils";

const CATEGORIES: AnnouncementCategory[] = ["general", "academic", "event", "emergency", "maintenance"];
const PRIORITIES: AnnouncementPriority[] = ["low", "normal", "high", "urgent"];

const STATUS_CONFIG: Record<AnnouncementStatus, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-muted text-muted-foreground" },
  published: { label: "Published", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  archived:  { label: "Archived",  cls: "bg-muted text-muted-foreground line-through" },
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

interface AnnouncementForm {
  title: string;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  expires_at: string;
}

const EMPTY_FORM: AnnouncementForm = {
  title: "", content: "", category: "general", priority: "normal", status: "draft", expires_at: "",
};

export function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<ManagedAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedAnnouncement | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ManagedAnnouncement | null>(null);

  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);
  const toast = useToast();

  const loadAnnouncements = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const data = await announcementService.listAnnouncements({ search });
      if (requestId !== requestRef.current) return;
      setAnnouncements(data);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Could not load announcements.");
      setAnnouncements([]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  if (loading) return <TablePageSkeleton rows={6} />;

  const filtered = announcements.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.content.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (a: ManagedAnnouncement) => {
    setForm({
      title: a.title, content: a.content, category: a.category, priority: a.priority,
      status: a.status, expires_at: toLocalInput(a.expiresAt),
    });
    setFormErrors({});
    setEditTarget(a);
    setShowModal(true);
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = "Title is required";
    if (!form.content.trim()) errors.content = "Content is required";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    setSaving(true);
    try {
      const input = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        priority: form.priority,
        status: form.status,
        expiresAt: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      if (editTarget) {
        await announcementService.updateAnnouncement(editTarget.id, input);
        toast.success("Announcement updated", `${form.title} has been updated.`);
      } else {
        await announcementService.createAnnouncement(input);
        toast.success(form.status === "published" ? "Announcement published" : "Announcement saved", `${form.title} has been ${form.status === "published" ? "published" : "saved as draft"}.`);
      }
      setShowModal(false);
      loadAnnouncements();
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "Could not save the announcement.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (a: ManagedAnnouncement) => {
    setBusy(true);
    try {
      await announcementService.publishAnnouncement(a.id);
      toast.success("Announcement published", `${a.title} is now live.`);
      loadAnnouncements();
    } catch (err) {
      toast.error("Publish failed", err instanceof Error ? err.message : "Could not publish the announcement.");
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      await announcementService.archiveAnnouncement(archiveTarget.id);
      toast.success("Announcement archived", `${archiveTarget.title} is no longer visible.`);
      setArchiveTarget(null);
      loadAnnouncements();
    } catch (err) {
      toast.error("Archive failed", err instanceof Error ? err.message : "Could not archive the announcement.");
    } finally {
      setBusy(false);
    }
  };

  if (error && announcements.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Manage Announcements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Official notices and updates for students.</p>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="Could not load announcements"
          description={error}
          action={
            <Button variant="primary" onClick={loadAnnouncements}>Try Again</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Manage Announcements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{announcements.length} total announcements</p>
        </div>
        <Button onClick={openAdd} variant="primary">
          <Plus className="h-3.5 w-3.5" /> Post Announcement
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
        className="max-w-sm"
      >
        <SearchBar
          placeholder="Search announcements..."
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          showShortcutHint
          size="md"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Announcement</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Created</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const statusCfg = STATUS_CONFIG[a.status];
                return (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 max-w-xs">
                      <p className="font-semibold text-foreground line-clamp-1">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(a.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <CategoryBadge category={a.category} />
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <PriorityBadge priority={a.priority} />
                    </td>
                    <td className="px-4 py-3.5 hidden xl:table-cell text-muted-foreground text-xs font-mono">
                      {formatDate(a.createdAt)}
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.cls}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {a.status === "draft" && (
                          <button type="button" onClick={() => handlePublish(a)} disabled={busy}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 active:scale-[0.97] transition-all disabled:opacity-50">
                            <Send className="h-3.5 w-3.5" /> Publish
                          </button>
                        )}
                        <button type="button" onClick={() => openEdit(a)}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted active:scale-[0.97] transition-all">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button type="button" onClick={() => setArchiveTarget(a)} disabled={busy}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 active:scale-[0.97] transition-all">
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            icon={search ? Search : Megaphone}
            title={search ? "No matching announcements" : "No announcements yet"}
            description={search
              ? "No announcements match your search criteria. Try a different keyword."
              : "Post your first announcement to share updates with students and staff."
            }
            action={search ? (
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); }}>
                Clear Search
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5" /> Post Announcement
              </Button>
            )}
          />
        )}
      </motion.div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            key="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
            role="dialog" aria-modal="true" aria-label="Announcement form"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-show-on-hover"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    {editTarget ? <Pencil className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
                  </div>
                  <h2 className="font-extrabold text-foreground text-sm">{editTarget ? "Edit Announcement" : "Post Announcement"}</h2>
                </div>
                <button type="button" aria-label="Close modal" onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <FormField
                  label="Title" id="announcement-title" value={form.title}
                  onChange={(v) => { setForm(f => ({ ...f, title: v })); if (formErrors.title) setFormErrors(prev => { const n = { ...prev }; delete n.title; return n; }); }}
                  error={formErrors.title} placeholder="Announcement title" required
                  helper="A concise, descriptive headline for the announcement" maxLength={200} showCharCount
                />
                <FormField
                  label="Content" id="announcement-content" value={form.content}
                  onChange={(v) => setForm(f => ({ ...f, content: v }))}
                  error={formErrors.content} placeholder="Full announcement content..." required rows={4}
                  helper="Provide full details about this announcement" maxLength={1000} showCharCount
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="announcement-category" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Category</label>
                    <select id="announcement-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as AnnouncementCategory })}
                      className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c} className="capitalize">{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="announcement-priority" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Priority</label>
                    <select id="announcement-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as AnnouncementPriority })}
                      className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p} className="capitalize">{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="announcement-status" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Status</label>
                    <select id="announcement-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AnnouncementStatus })}
                      className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="announcement-expires" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Expires At</label>
                    <input id="announcement-expires" type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                      className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Published announcements appear on the student feed until they expire or are archived.</p>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
                <Button variant="primary" onClick={handleSave} className="flex-1" disabled={saving || !form.title.trim() || !form.content.trim()}>
                  {saving ? "Saving…" : editTarget ? "Save Changes" : "Post Announcement"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Archive confirm */}
      <AnimatePresence>
        {archiveTarget && (
          <motion.div
            key="archive-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <Archive className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-extrabold text-foreground mb-1">Archive Announcement?</h3>
              <p className="text-sm text-muted-foreground mb-5">"{archiveTarget.title}" will no longer be visible to students.</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setArchiveTarget(null)} className="flex-1">Cancel</Button>
                <Button variant="danger" onClick={handleArchive} className="flex-1" disabled={busy}>
                  {busy ? "Archiving…" : "Archive"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
