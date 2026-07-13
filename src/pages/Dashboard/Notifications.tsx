import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, CheckCheck, ShieldCheck, Package, MessageSquare, Star, Trash2, Crown, ChevronDown, ChevronUp, AtSign, Repeat2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../lib/ToastContext';
import { isChatMessageNotification } from '../../lib/notifications';
import { useAllBlockedUserIds } from '../../lib/blocks';
import { NotificationRowSkeleton } from '../../components/ui/skeleton/Skeleton';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: any;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  user_approved: <ShieldCheck size={20} className="text-brand-teal" />,
  listing_approved: <Package size={20} className="text-brand-mint" />,
  listing_rejected: <Package size={20} className="text-red-400" />,
  new_message: <MessageSquare size={20} className="text-brand-pink" />,
  new_post: <Bell size={20} className="text-brand-teal" />,
  item_reserved: <Package size={20} className="text-amber-500" />,
  item_sold: <Package size={20} className="text-brand-teal" />,
  new_review: <Star size={20} className="text-yellow-500" />,
  admin_promoted: <Crown size={20} className="text-brand-pink" />,
  mention: <AtSign size={20} className="text-indigo-500" />,
  repost: <Repeat2 size={20} className="text-emerald-500" />,
};

export default function Notifications() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'deals' | 'social' | 'system'>('all');
  const allBlockedIds = useAllBlockedUserIds();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    deals: false,
    social: false,
    system: false,
  });

  const isDeals = (type: string) => ['listing_approved', 'listing_rejected', 'item_reserved', 'item_sold', 'new_review'].includes(type);
  const isSocial = (type: string) => ['new_message', 'mention', 'repost', 'new_post'].includes(type);
  const isSystem = (type: string) => ['user_approved', 'admin_promoted'].includes(type);

  const getNotificationCategory = (type: string): 'deals' | 'social' | 'system' | 'other' => {
    if (isDeals(type)) return 'deals';
    if (isSocial(type)) return 'social';
    if (isSystem(type)) return 'system';
    return 'other';
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  // Extract userId from notification link (e.g., /profile/{uid}) for block filtering
  const extractUserIdFromLink = (link?: string): string | null => {
    if (!link) return null;
    const profileMatch = link.match(/\/profile\/([^/]+)/);
    if (profileMatch) return profileMatch[1];
    const usernameMatch = link.match(/\/u\/([^/]+)/);
    if (usernameMatch) return usernameMatch[1]; // username, not uid — can't block filter by this
    return null;
  };

  const filteredNotifications = notifications.filter(n => {
    // Block filter: hide notifications from blocked users
    const linkedUserId = extractUserIdFromLink(n.link);
    if (linkedUserId && allBlockedIds.has(linkedUserId)) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'deals') return isDeals(n.type);
    if (activeFilter === 'social') return isSocial(n.type);
    if (activeFilter === 'system') return isSystem(n.type);
    return true;
  });

  const unreadCount = filteredNotifications.filter(n => !n.read).length;

  const unreadCounts = {
    all: notifications.filter(n => !n.read).length,
    deals: notifications.filter(n => !n.read && isDeals(n.type)).length,
    social: notifications.filter(n => !n.read && isSocial(n.type)).length,
    system: notifications.filter(n => !n.read && isSystem(n.type)).length,
  };

  const unreadNotifications = filteredNotifications.filter(n => !n.read);
  const readNotifications = filteredNotifications.filter(n => n.read);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = [];
      snapshot.forEach((d) => {
        notifs.push({ id: d.id, ...d.data() } as Notification);
      });
      setNotifications(notifs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const markAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    const unread = filteredNotifications.filter(n => !n.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      unread.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
      showToast(activeFilter === 'all' ? 'All notifications marked as read' : 'Tab notifications marked as read', 'success');
    } catch {
      showToast('Failed to update notifications', 'error');
    }
  };

  const deleteNotification = async (notifId: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', notifId));
    } catch {
      showToast('Failed to delete notification', 'error');
    }
  };

  const handleClick = (notif: Notification) => {
    if (!notif.read) markAsRead(notif.id);
    if (notif.link) navigate(notif.link);
  };

  return (
    <div className="pt-32 pb-20 px-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-serif font-bold text-luxury-ink italic mb-2">
            Notifications
          </h1>
          <p className="text-luxury-ink/40 font-medium uppercase text-[10px] tracking-[0.2em]">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-teal/10 text-brand-teal rounded-full text-xs font-bold uppercase tracking-widest hover:bg-brand-teal hover:text-white transition-all"
          >
            <CheckCheck size={16} /> Mark All Read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col">
          {Array.from({ length: 8 }).map((_, i) => (
            <NotificationRowSkeleton key={i} />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-surface-card rounded-3xl p-20 text-center luxury-shadow border border-luxury-ink/5">
          <div className="w-16 h-16 bg-brand-teal/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Bell className="text-brand-teal" size={32} />
          </div>
          <h3 className="text-xl font-serif font-bold text-luxury-ink mb-2 italic">
            All <span className="not-italic">Clear</span>
          </h3>
          <p className="text-luxury-ink/40 text-sm max-w-xs mx-auto font-medium">
            You'll be notified when something important happens — approvals, messages, and more.
          </p>
        </div>
      ) : (
        <>
          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-8 pb-2">
            {([
              { key: 'all', label: 'All', icon: <Bell size={14} />, count: unreadCounts.all },
              { key: 'deals', label: 'Deals', icon: <Package size={14} />, count: unreadCounts.deals },
              { key: 'social', label: 'Social', icon: <MessageSquare size={14} />, count: unreadCounts.social },
              { key: 'system', label: 'System', icon: <ShieldCheck size={14} />, count: unreadCounts.system }
            ] as const).map(({ key, label, icon, count }) => {
              const isActive = activeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-luxury-ink text-surface-base luxury-shadow scale-[1.02]'
                      : 'bg-luxury-ink/5 text-luxury-ink/60 hover:bg-luxury-ink/10 hover:text-luxury-ink'
                  }`}
                  style={isActive ? { color: 'var(--color-surface-base)' } : undefined}
                >
                  {icon}
                  <span>{label}</span>
                  {count > 0 && (
                    <span className={`flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold rounded-full min-w-[16px] transition-all leading-none ${
                      isActive
                        ? 'bg-brand-pink text-white'
                        : 'bg-brand-pink/10 text-brand-pink'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="bg-surface-card rounded-3xl p-16 text-center luxury-shadow border border-luxury-ink/5">
              <div className="w-12 h-12 bg-luxury-ink/5 rounded-xl flex items-center justify-center mx-auto mb-4">
                {activeFilter === 'deals' && <Package size={24} className="text-luxury-ink/40" />}
                {activeFilter === 'social' && <MessageSquare size={24} className="text-luxury-ink/40" />}
                {activeFilter === 'system' && <ShieldCheck size={24} className="text-luxury-ink/40" />}
                {activeFilter === 'all' && <Bell size={24} className="text-luxury-ink/40" />}
              </div>
              <h3 className="text-lg font-serif font-bold text-luxury-ink mb-1 italic">
                No {activeFilter === 'all' ? '' : activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} Notifications
              </h3>
              <p className="text-luxury-ink/40 text-xs max-w-xs mx-auto font-medium">
                There are no notifications in this category right now.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Unread Notifications Section */}
              {unreadNotifications.length > 0 && (
                <div className="space-y-3">
                  <AnimatePresence>
                    {unreadNotifications.map((notif) => (
                      <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -40 }}
                        onClick={() => handleClick(notif)}
                        className="bg-surface-card rounded-2xl p-5 md:p-6 luxury-shadow border flex items-start gap-4 cursor-pointer transition-all group hover:translate-x-1 border-brand-teal/20 bg-brand-teal/[0.02]"
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-brand-teal/10">
                          {ICON_MAP[notif.type] || <Bell size={20} className="text-luxury-ink/40" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-luxury-ink text-sm">{notif.title}</h3>
                            <span className="w-2 h-2 bg-brand-pink rounded-full shrink-0" />
                          </div>
                          <p className="text-luxury-ink/50 text-sm font-medium leading-relaxed">{notif.message}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/20 mt-2">
                            {notif.createdAt?.toDate?.()?.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Just now'}
                          </p>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notif.id);
                          }}
                          className="p-2 rounded-lg text-luxury-ink/10 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Read Notifications Section (Clubbed by Category) */}
              {readNotifications.length > 0 && (
                <div className="space-y-4">
                  {([
                    { key: 'deals', label: 'Deals', icon: <Package size={20} className="text-brand-mint" /> },
                    { key: 'social', label: 'Social', icon: <MessageSquare size={20} className="text-brand-pink" /> },
                    { key: 'system', label: 'System', icon: <ShieldCheck size={20} className="text-brand-teal" /> },
                  ] as const).map(({ key, label, icon }) => {
                    const groupNotifs = readNotifications.filter(
                      (n) =>
                        getNotificationCategory(n.type) === key ||
                        (key === 'system' && getNotificationCategory(n.type) === 'other')
                    );
                    if (groupNotifs.length === 0) return null;

                    const isExpanded = expandedGroups[key];

                    return (
                      <div
                        key={key}
                        className="bg-surface-card rounded-3xl border border-luxury-ink/5 luxury-shadow overflow-hidden transition-all duration-300"
                      >
                        <button
                          onClick={() => toggleGroup(key)}
                          className="w-full flex items-center justify-between p-5 md:p-6 hover:bg-luxury-ink/[0.01] transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-luxury-ink/5 flex items-center justify-center shrink-0">
                              {icon}
                            </div>
                            <div className="text-left">
                              <h4 className="font-bold text-luxury-ink text-sm">
                                Read {label} Notifications
                              </h4>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mt-0.5">
                                {groupNotifs.length} notification{groupNotifs.length > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-luxury-ink/40 p-1.5 hover:text-luxury-ink transition-colors">
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </button>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: 'easeInOut' }}
                              className="overflow-hidden border-t border-luxury-ink/5 bg-luxury-ink/[0.01]"
                            >
                              <div className="p-4 space-y-1">
                                {groupNotifs.map((notif) => (
                                  <div
                                    key={notif.id}
                                    onClick={() => handleClick(notif)}
                                    className="p-4 rounded-2xl flex items-start gap-4 cursor-pointer transition-all group hover:bg-luxury-ink/[0.02]"
                                  >
                                    <div className="w-8 h-8 rounded-xl bg-luxury-ink/5 flex items-center justify-center shrink-0">
                                      {ICON_MAP[notif.type] || <Bell size={16} className="text-luxury-ink/40" />}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h5 className="font-bold text-luxury-ink text-sm">{notif.title}</h5>
                                      </div>
                                      <p className="text-luxury-ink/50 text-xs font-medium leading-relaxed">
                                        {notif.message}
                                      </p>
                                      <p className="text-[9px] font-bold uppercase tracking-widest text-luxury-ink/20 mt-1.5">
                                        {notif.createdAt?.toDate?.()?.toLocaleDateString([], {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        }) || 'Just now'}
                                      </p>
                                    </div>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteNotification(notif.id);
                                      }}
                                      className="p-1.5 rounded-lg text-luxury-ink/10 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
