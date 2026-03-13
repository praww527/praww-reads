import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { ArrowLeft, BookOpen, Pencil, Loader2, Users, Camera, X, Check, BadgeCheck, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

async function resizeImage(file, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const MAX = 800;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      let q = 0.9, data = canvas.toDataURL("image/jpeg", q);
      while (data.length > maxBytes * 1.37 && q > 0.3) { q -= 0.1; data = canvas.toDataURL("image/jpeg", q); }
      resolve(data);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function Profile() {
  const { userId } = useParams();
  const { user: me, isAuthenticated, loading: authLoading, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [imagePreview, setImagePreview] = useState("");
  const [imageProcessing, setImageProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState({ can_change: true, days_left: 0 });
  const fileRef = useRef(null);

  const isOwnProfile = !userId || userId === "me" || userId === me?.id;

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated && isOwnProfile) { navigate("/login"); return; }
      fetchProfile();
    }
  }, [authLoading, userId, me]);

  async function fetchProfile() {
    setLoading(true);
    try {
      const endpoint = isOwnProfile ? "/profile/me" : `/profile/${userId}`;
      const p = await apiFetch(endpoint);
      setProfile(p);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function openEdit() {
    setEditForm({
      username: profile?.username || "",
      bio: profile?.bio || "",
      first_name: profile?.first_name || "",
      last_name: profile?.last_name || "",
      profile_image_url: profile?.profile_image_url || "",
    });
    setImagePreview(profile?.profile_image_url || "");
    try {
      const status = await apiFetch("/api/profile/username-status");
      setUsernameStatus(status);
    } catch {
      setUsernameStatus({ can_change: true, days_left: 0 });
    }
    setEditOpen(true);
  }

  async function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageProcessing(true);
    try {
      const data = await resizeImage(file);
      setImagePreview(data);
      setEditForm(f => ({ ...f, profile_image_url: data }));
    } finally {
      setImageProcessing(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await apiFetch("/profile", { method: "PATCH", body: JSON.stringify(editForm) });
      setProfile(p => ({ ...p, ...updated }));
      await refreshUser();
      setEditOpen(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleFollow() {
    if (!isAuthenticated) { navigate("/login"); return; }
    if (profile.is_following) {
      await apiFetch(`/follow/${profile.id}`, { method: "DELETE" });
    } else {
      await apiFetch(`/follow/${profile.id}`, { method: "POST" });
    }
    fetchProfile();
  }

  if (authLoading || loading) return (
    <div className="container mx-auto max-w-4xl px-4 py-12 space-y-6">
      <div className="h-24 rounded-2xl bg-muted animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
      </div>
    </div>
  );

  if (!profile) return (
    <div className="p-8 text-center">
      <p className="text-destructive text-lg">Profile not found</p>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">Back to Home</Link>
    </div>
  );

  const displayName = profile.first_name && profile.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : profile.username || profile.email || "User";

  const stories = profile.stories || [];

  // Generate a short readable user ID
  const shortId = profile.id ? `#${profile.id.slice(0, 8).toUpperCase()}` : "";

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {/* Profile Header */}
      <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-8 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            {profile.profile_image_url ? (
              <img src={profile.profile_image_url} alt={displayName} className="w-20 h-20 rounded-full object-cover border-2 border-border" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-2xl border-2 border-border">
                {displayName[0]?.toUpperCase() || "?"}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h1 data-testid="profile-name" className="font-serif text-2xl font-bold">{displayName}</h1>
                  <BadgeCheck className="h-5 w-5 text-primary" title="Verified account" />
                </div>
                {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{shortId}</p>
              </div>
              <div className="flex items-center gap-2">
                {isOwnProfile ? (
                  <>
                    <Link to="/write" className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-border px-3 py-1.5 hover:bg-muted transition-colors">
                      <BookOpen className="h-3.5 w-3.5" /> Write Story
                    </Link>
                    <button data-testid="edit-profile-btn" onClick={openEdit}
                      className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-border px-3 py-1.5 hover:bg-muted transition-colors">
                      <Pencil className="h-3.5 w-3.5" /> Edit Profile
                    </button>
                  </>
                ) : me && (
                  <button data-testid="follow-btn" onClick={handleFollow}
                    className={`inline-flex items-center gap-1.5 text-sm rounded-lg px-4 py-1.5 transition-colors font-medium ${profile.is_following ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
                    <Users className="h-3.5 w-3.5" />
                    {profile.is_following ? "Following" : "Follow"}
                  </button>
                )}
              </div>
            </div>

            {profile.bio && <p data-testid="profile-bio" className="mt-3 text-muted-foreground text-sm max-w-xl">{profile.bio}</p>}

            <div className="mt-4 flex items-center gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span data-testid="follower-count" className="font-semibold text-foreground">{profile.follower_count || 0}</span> Followers
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span data-testid="following-count" className="font-semibold text-foreground">{profile.following_count || 0}</span> Following
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                <span className="font-semibold text-foreground">{stories.length}</span> Stories
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stories */}
      <div>
        <h2 className="font-serif text-2xl font-bold mb-6">{isOwnProfile ? "Your Stories" : "Stories"}</h2>
        {stories.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl bg-muted/10">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">{isOwnProfile ? "You haven't published any stories yet." : "No stories published yet."}</p>
            {isOwnProfile && (
              <Link to="/write" className="inline-block mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Write Your First Story</Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {stories.map(story => (
              <Link key={story.id} to={`/stories/${story.id}`} data-testid={`profile-story-card-${story.id}`}>
                <div className="group h-full flex flex-col border border-border/60 rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-200 bg-card cursor-pointer">
                  {story.cover_image_url && (
                    <div className="aspect-video overflow-hidden border-b border-border/50">
                      <img src={story.cover_image_url} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-serif font-bold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">{story.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{story.created_at ? formatDistanceToNow(new Date(story.created_at)) + " ago" : "recently"}</p>
                    {story.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-2 italic">{story.description}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Edit Profile Dialog */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-background rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-serif text-xl font-bold">Edit Profile</h2>
              <button onClick={() => setEditOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Profile Photo */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Profile Photo</label>
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    {imagePreview ? (
                      <img data-testid="profile-image-preview" src={imagePreview} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-border" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl border-2 border-border">
                        {(editForm.first_name || displayName || "?")[0].toUpperCase()}
                      </div>
                    )}
                    {imageProcessing && (
                      <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <label data-testid="profile-image-label" className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md border border-dashed border-border hover:border-primary/60 hover:bg-primary/5 transition-colors text-sm text-muted-foreground">
                      <Camera className="h-4 w-4 shrink-0" />
                      {imagePreview ? "Change photo" : "Upload photo"}
                      <input ref={fileRef} data-testid="profile-image-input" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                    {imagePreview && (
                      <button type="button" onClick={() => { setImagePreview(""); setEditForm(f => ({ ...f, profile_image_url: "" })); }}
                        className="text-xs text-destructive hover:underline mt-1">Remove photo</button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">First Name</label>
                  <input data-testid="edit-first-name-input" value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                    placeholder="First name"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Last Name</label>
                  <input data-testid="edit-last-name-input" value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                    placeholder="Last name"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Username</label>
                  {!usernameStatus.can_change && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <Lock className="h-3 w-3" />
                      Locked for {usernameStatus.days_left} more day{usernameStatus.days_left !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    data-testid="edit-username-input"
                    value={editForm.username}
                    onChange={e => !usernameStatus.can_change ? undefined : setEditForm(f => ({ ...f, username: e.target.value }))}
                    readOnly={!usernameStatus.can_change}
                    placeholder="@username"
                    className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary pr-8 ${!usernameStatus.can_change ? "opacity-60 cursor-not-allowed bg-muted" : ""}`}
                  />
                  {!usernameStatus.can_change && (
                    <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                {!usernameStatus.can_change && (
                  <p className="text-xs text-muted-foreground">You can only change your username once every 30 days.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bio</label>
                <textarea data-testid="edit-bio-textarea" value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))}
                  placeholder="Tell readers a little about yourself..." rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Cancel</button>
                <button data-testid="save-profile-btn" type="submit" disabled={saving || imageProcessing}
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

