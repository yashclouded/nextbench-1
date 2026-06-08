import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import PostCard from '../components/ui/PostCard';
import Navbar from '../components/layout/Navbar';
import ShareModal from '../components/ui/ShareModal';

export default function PostView() {
  const { postId } = useParams<{ postId: string }>();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [shareModalData, setShareModalData] = useState<{isOpen: boolean, url: string, title: string, sharedPost?: any}>({isOpen: false, url: '', title: ''});

  useEffect(() => {
    if (!postId) return;
    
    const fetchPost = async () => {
      try {
        const docRef = doc(db, 'posts', postId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setPost({ id: docSnap.id, ...docSnap.data() });
        } else {
          setPost(null);
        }
      } catch (error) {
        console.error("Error fetching post:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [postId]);

  const requireAuth = () => {
    if (!user) {
      showToast('Please sign in to interact with this post', 'info');
      navigate('/login');
      return false;
    }
    return true;
  };

  const handleInteraction = (action: string) => {
    if (!requireAuth()) return;
    // Redirect to community with postId to open the modal
    if (post && post.id) {
      navigate(`/community?postId=${post.id}`);
    } else {
      navigate('/community');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-base flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!post || (post.privacy === 'private' && !user)) {
    return (
      <div className="min-h-screen bg-surface-base flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-2xl font-bold text-luxury-ink mb-2">Post Not Found</h2>
          <p className="text-luxury-ink/60 mb-6 max-w-md">
            This post may have been deleted, is private, or doesn't exist.
          </p>
          {!user ? (
            <Link to="/login" className="px-6 py-3 bg-brand-teal text-white rounded-full font-bold">
              Sign In
            </Link>
          ) : (
            <Link to="/community" className="px-6 py-3 bg-brand-teal text-white rounded-full font-bold">
              Back to Feed
            </Link>
          )}
        </div>
      </div>
    );
  }

  const plainTextContent = post.content || '';
  const postTitle = post.title || plainTextContent.substring(0, 40) + '...';
  const metaDescription = plainTextContent.substring(0, 150);
  const ogImage = post.imageUrls?.[0] || post.imageUrl || 'https://nextbench.com/default-og.png'; // Fallback URL

  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      <Helmet>
        <title>{postTitle} | Nextbench</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={postTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 md:py-12">
        {!user && (
          <div className="mb-6 p-4 bg-brand-teal/10 rounded-2xl border border-brand-teal/20 text-center">
            <h3 className="font-bold text-brand-teal mb-1">Join the conversation</h3>
            <p className="text-sm text-luxury-ink/70 mb-3">Sign up to reply, react, and connect with students.</p>
            <Link to="/signup" className="inline-block px-5 py-2 bg-brand-teal text-white rounded-full text-sm font-bold">
              Create Account
            </Link>
          </div>
        )}

        <div className="bg-surface-card rounded-3xl overflow-hidden border luxury-shadow" style={{ borderColor: 'var(--color-border)' }}>
          <PostCard
            post={post}
            hasUpvoted={false}
            hasDownvoted={false}
            hasSaved={false}
            onClick={() => handleInteraction('view')}
            onUpvote={() => handleInteraction('upvote')}
            onDownvote={() => handleInteraction('downvote')}
            onSave={() => handleInteraction('save')}
            onShare={() => {
              const url = window.location.origin + '/post/' + post.id;
              setShareModalData({
                isOpen: true,
                url,
                title: post.title,
                sharedPost: {
                  id: post.id,
                  title: post.title,
                  description: post.content || '',
                  image: post.images?.[0] || undefined,
                  authorName: post.authorName || 'Unknown User'
                }
              });
            }}
          />
        </div>
      </main>
      <ShareModal
        isOpen={shareModalData.isOpen}
        onClose={() => setShareModalData(prev => ({ ...prev, isOpen: false }))}
        postUrl={shareModalData.url}
        postTitle={shareModalData.title}
        sharedPost={shareModalData.sharedPost}
      />
    </div>
  );
}
