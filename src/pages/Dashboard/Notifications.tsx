import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, CheckCheck, ShieldCheck, Package, MessageSquare, Star, Trash2, Crown } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../lib/ToastContext';
import { isChatMessageNotification } from '../../lib/notifications';

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
};

export default function Notifications() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, [user]);

  const markAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      unread.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
      showToast('All notifications marked as read', 'success');
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

  const unreadCount = notifications.filter(n => !n.read).length;
  const getNotificationIcon = (notif: Notification) => {
    if (notif.type === 'new_message' && !isChatMessageNotification(notif)) {
      return ICON_MAP.new_post;
    }

    return ICON_MAP[notif.type] || <Bell size={20} className="text-luxury-ink/40" />;
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
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/30">Loading notifications...</p>
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
        <div className="space-y-3">
          <AnimatePresence>
            {notifications.map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -40 }}
                onClick={() => handleClick(notif)}
                className={`bg-surface-card rounded-2xl p-5 md:p-6 luxury-shadow border flex items-start gap-4 cursor-pointer transition-all group hover:translate-x-1 ${notif.read
                  ? 'border-luxury-ink/5 opacity-60'
                  : 'border-brand-teal/20 bg-brand-teal/[0.02]'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${notif.read ? 'bg-luxury-ink/5' : 'bg-brand-teal/10'
                  }`}>
                  {getNotificationIcon(notif)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-luxury-ink text-sm">{notif.title}</h3>
                    {!notif.read && (
                      <span className="w-2 h-2 bg-brand-pink rounded-full shrink-0" />
                    )}
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
    </div>
  );
}
