import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { Bell, Plus, Search, Pencil, Trash2, X, Megaphone } from "lucide-react";
import { useToast } from "../hooks/useToast";
import { MOCK_ANNOUNCEMENTS } from "../data/mockData";
import type { Announcement } from "../types";
import { CategoryBadge, PriorityBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchBar } from "../components/ui/SearchBar";
import { formatDate } from "../lib/utils";

export function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "", content: "", category: "general" as Announcement["category"],
    priority: "normal" as Announcement["priority"], author: "", expires_at: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnnouncements(MOCK_ANNOUNCEMENTS);
      setLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <TablePageSkeleton rows={6} />;

  const filtered = announcements.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.author.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm({ title: "", content: "", category: "general", priority: "normal", author: "", expires_at: "" });
    setFormErrors({});
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (a: Announcement) => {
    setForm({ title: a.title, content: a.content, category: a.category, priority: a.priority, author: a.author, expires_at: a.expires_at ?? "" });
    setFormErrors({});
    setEditTarget(a);
    setShowModal(true);
  };

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = "Title is required";
    if (!form.content.trim()) errors.content = "Content is required";
    if (!form.author.trim()) errors.author = "Author is required";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    if (editTarget) {
      setAnnouncements((prev) => prev.map((a) => a.id === editTarget.id ? { ...a, ...form } : a));
      toast.success("Announcement updated", `${form.title} has been updated.`);
    } else {
      const na: Announcement = {
        ...form, id: `a${Date.now()}`, published_at: new Date().toISOString(), is_active: true,
        expires_at: form.expires_at || undefined,
      };
      setAnnouncements((prev) => [na, ...prev]);
      toast.success("Announcement posted", `${form.title} has been published.`);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    const deleted = announcements.find(a => a.id === id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    setDeleteId(null);
    if (deleted) toast.success("Announcement deleted", `${deleted.title} has been removed.`);
  };

  const toggleActive = (id: string) => {
    setAnnouncements((prev) => prev.map((a) => a.id === id ? { ...a, is_active: !a.is_active } : a));
  };

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
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Published</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5 max-w-xs">
                    <p className="font-semibold text-foreground line-clamp-1">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.author}</p>
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <CategoryBadge category={a.category} />
                  </td>
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    <PriorityBadge priority={a.priority} />
                  </td>
                  <td className="px-4 py-3.5 hidden xl:table-cell text-muted-foreground text-xs font-mono">
                    {formatDate(a.published_at)}
                  </td>
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    <button
                      onClick={() => toggleActive(a.id)}
                      type="button"
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                        a.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200" : "bg-muted text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {a.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" aria-label="Edit announcement" onClick={() => openEdit(a)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Delete announcement" onClick={() => setDeleteId(a.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
      {showModal && (
        <AnimatePresence>
          <motion.div
            key="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
                  <div>
                    <h2 className="font-extrabold text-foreground text-sm">{editTarget ? "Edit Announcement" : "Post Announcement"}</h2>
                  </div>
                </div>
                <button type="button" aria-label="Close modal" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <FormField
                  label="Title" id="announcement-title" value={form.title}
                  onChange={(v) => { setForm(f => ({ ...f, title: v })); if (formErrors.title) setFormErrors(prev => { const n = {...prev}; delete n.title; return n; }); }}
                  error={formErrors.title} placeholder="Announcement title" required
                  helper="A concise, descriptive headline for the announcement" maxLength={200} showCharCount
                />
                <FormField
                  label="Content" id="announcement-content" value={form.content}
                  onChange={(v) => setForm(f => ({ ...f, content: v }))}
                  error={formErrors.content} placeholder="Full announcement content..." required rows={4}
                  helper="Provide full details about this announcement" maxLength={1000} showCharCount
                />
                <FormField
                  label="Author" id="announcement-author" value={form.author}
                  onChange={(v) => setForm(f => ({ ...f, author: v }))}
                  error={formErrors.author} placeholder="e.g. Office of the Registrar" required
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="announcement-category" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Category</label>
                    <select id="announcement-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Announcement["category"] })}
                      className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                      {["general", "academic", "event", "emergency", "maintenance"].map((c) => (
                        <option key={c} value={c} className="capitalize">{c}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">Categorizes the type of announcement</p>
                  </div>
                  <div>
                    <label htmlFor="announcement-priority" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Priority</label>
                    <select id="announcement-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Announcement["priority"] })}
                      className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                      {["low", "normal", "high", "urgent"].map((p) => (
                        <option key={p} value={p} className="capitalize">{p}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">Determines display prominence on student feeds</p>
                  </div>
                </div>
                <div>
                  <label htmlFor="announcement-expires" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Expires At</label>
                  <input id="announcement-expires" type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all" />
                  <p className="text-[10px] text-muted-foreground mt-1">Leave empty for no expiration date</p>
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
                <Button variant="primary" onClick={handleSave} className="flex-1" disabled={!form.title.trim() || !form.content.trim() || !form.author.trim()}>
                  {editTarget ? "Save Changes" : "Post Announcement"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && (
          <motion.div
            key="delete-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
                <Trash2 className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-extrabold text-foreground mb-1">Delete Announcement?</h3>
              <p className="text-sm text-muted-foreground mb-5">This announcement will be permanently removed. Consider deactivating it instead if it may be needed again.</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
                <Button variant="danger" onClick={() => handleDelete(deleteId)} className="flex-1">Delete Announcement</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
