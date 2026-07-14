import { useState } from "react";
import { Bell, Plus, Search, Pencil, Trash2, X } from "lucide-react";
import { MOCK_ANNOUNCEMENTS } from "../data/mockData";
import type { Announcement } from "../types";
import { CategoryBadge, PriorityBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { formatDate } from "../lib/utils";

export function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>(MOCK_ANNOUNCEMENTS);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "", content: "", category: "general" as Announcement["category"],
    priority: "normal" as Announcement["priority"], author: "", expires_at: "",
  });

  const filtered = announcements.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.author.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm({ title: "", content: "", category: "general", priority: "normal", author: "", expires_at: "" });
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (a: Announcement) => {
    setForm({ title: a.title, content: a.content, category: a.category, priority: a.priority, author: a.author, expires_at: a.expires_at ?? "" });
    setEditTarget(a);
    setShowModal(true);
  };

  const handleSave = () => {
    if (editTarget) {
      setAnnouncements((prev) => prev.map((a) => a.id === editTarget.id ? { ...a, ...form } : a));
    } else {
      const na: Announcement = {
        ...form, id: `a${Date.now()}`, published_at: new Date().toISOString(), is_active: true,
        expires_at: form.expires_at || undefined,
      };
      setAnnouncements((prev) => [na, ...prev]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    setDeleteId(null);
  };

  const toggleActive = (id: string) => {
    setAnnouncements((prev) => prev.map((a) => a.id === id ? { ...a, is_active: !a.is_active } : a));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manage Announcements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{announcements.length} total announcements</p>
        </div>
        <Button onClick={openAdd} variant="primary">
          <Plus className="h-4 w-4" /> Post Announcement
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search announcements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
        />
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
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
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                        a.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200" : "bg-muted text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {a.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(a)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(a.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
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
          <div className="flex flex-col items-center py-12 text-center">
            <Bell className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No announcements found.</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-show-on-hover">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-3xl">
              <h2 className="font-bold text-foreground">{editTarget ? "Edit Announcement" : "Post Announcement"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="announcement-title" className="block text-sm font-semibold text-foreground mb-1.5">Title</label>
                <input id="announcement-title" type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Announcement title" className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
              </div>
              <div>
                <label htmlFor="announcement-content" className="block text-sm font-semibold text-foreground mb-1.5">Content</label>
                <textarea id="announcement-content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Full announcement content..." rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none" />
              </div>
              <div>
                <label htmlFor="announcement-author" className="block text-sm font-semibold text-foreground mb-1.5">Author</label>
                <input id="announcement-author" type="text" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}
                  placeholder="e.g. Office of the Registrar" className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="announcement-category" className="block text-sm font-semibold text-foreground mb-1.5">Category</label>
                  <select id="announcement-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Announcement["category"] })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm">
                    {["general", "academic", "event", "emergency", "maintenance"].map((c) => (
                      <option key={c} value={c} className="capitalize">{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="announcement-priority" className="block text-sm font-semibold text-foreground mb-1.5">Priority</label>
                  <select id="announcement-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Announcement["priority"] })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm">
                    {["low", "normal", "high", "urgent"].map((p) => (
                      <option key={p} value={p} className="capitalize">{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="announcement-expires" className="block text-sm font-semibold text-foreground mb-1.5">Expires At (optional)</label>
                <input id="announcement-expires" type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={handleSave} className="flex-1">
                {editTarget ? "Save Changes" : "Post Announcement"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="font-bold text-foreground mb-1">Delete Announcement?</h3>
            <p className="text-sm text-muted-foreground mb-5">This will permanently remove the announcement.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
              <Button variant="danger" onClick={() => handleDelete(deleteId)} className="flex-1">Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
