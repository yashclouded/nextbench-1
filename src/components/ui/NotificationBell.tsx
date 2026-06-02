import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { isChatMessageNotification } from '../../lib/notifications';

export default function NotificationBell() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let unreadNotifications = 0;
      snapshot.docs.forEach((d) => {
        if (!isChatMessageNotification(d.data())) {
          unreadNotifications++;
        }
      });
      setUnreadCount(unreadNotifications);
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <Link to="/notifications" className="relative p-2 rounded-xl hover:bg-surface-soft transition-all group">
      <Bell size={20} className="text-brand-teal/50 group-hover:text-brand-pink transition-colors" />
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-brand-pink text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
