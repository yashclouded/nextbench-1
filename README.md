# Campus Marketplace (CodeName: Prestige)

## 💡 The App Idea
An exclusive, hype-driven marketplace designed specifically for school and college campuses. Inspired by luxury and streetwear release aesthetics (think "Drop" culture), the platform allows students to buy and sell premium, limited, or everyday items in a secure, verified environment. 

The core philosophy revolves around **trust and exclusivity**:
- **Gated Access**: Users must be verified members of their campus.
- **Verification System**: Every user and product listing goes through an admin approval pipeline to ensure safety and quality control.
- **Micro-Communities**: Trading is localized to campuses (e.g., meeting up in the cafeteria or parking lot), eliminating complex shipping logistics unless requested.

---

## ⚙️ Architecture & Algorithm

### How it Works (The Flow)
1. **Onboarding & Gating**
   - User signs in using Google Authentication.
   - User selects their campus from a predefined list (or submits a request to add their school).
   - A new user profile is created in Firestore with `verified: false`.

2. **Admin Verification Pipeline (Users)**
   - The user cannot actively list products until approved.
   - An Admin logs into the Admin Panel, reviews the pending user, and clicks "Approve". 
   - The user's status updates to `verified: true`.
   - **The user receives an in-app notification** upon approval.

3. **Content Moderation Pipeline (Listings)**
   - A verified user uploads a product (Title, Price, Condition, Category, Images via **Firebase Storage**).
   - The listing is securely written to Firestore with `status: 'pending'`.
   - The Admin reviews the listing in the Admin Panel to ensure it meets community guidelines.
   - Upon approval, the listing changes to `status: 'available'` and appears on the public feed.
   - **The seller receives a notification** when their listing is approved or rejected.

4. **Transaction Lifecycle**
   - Buyer reserves an item → status changes to `reserved`.
   - Seller can **mark as sold** or **cancel reservation**.
   - Buyer/seller can cancel the reservation.
   - After a sale, the **buyer can leave a star rating & review**.

5. **Security & State Management**
   - **Firestore Security Rules**: The entire algorithm is enforced at the database level.
   - **Route Guards**: Frontend routes are protected via `ProtectedRoute` component (requireAuth, requireVerified, requireAdmin).
   - **State Locking**: Once a product is marked 'sold', it becomes immutable.

---

## 📈 Features — Complete

- [x] **Authentication**: Google Sign-In integrated
- [x] **Secure Database Structure**: Firestore with `users`, `products`, `chatRooms`, `wishlists`, `reviews`, `notifications` collections
- [x] **Firestore Security Rules**: Hardened rules for all collections with attribute-based access control
- [x] **Custom User Profiles**: Google photos, customizable names, "About Me" sections
- [x] **Dynamic School Selection**: Campus picker with Web3Forms integration for unlisted schools
- [x] **Selling Interface**: Verified users can draft and submit listings with **Firebase Storage image upload**
- [x] **Admin Panel**: 
  - User Verification Tab (approve/reject users with notifications)
  - Listing Approval Tab (approve/reject listings with image preview)
  - **User Management Tab** (view all users, promote/demote admins)
  - **Dashboard Stats** (total users, verified count, total listings, pending count)
- [x] **Marketplace UI**: Luxury-themed feed with **advanced filtering** (category, condition, price range, campus, sort)
- [x] **In-App Messaging**: Real-time Firestore chat with **quick reply buttons** and report functionality
- [x] **Transaction Lifecycle**: Reserve → Unreserve → Mark Sold flow with full seller controls
- [x] **Reputation & Review System**: Star ratings and comments after completed transactions
- [x] **Wishlists / Bookmarks**: Save items with heart toggle on marketplace cards and product detail
- [x] **Search & Advanced Filtering**: Filter by category, price range, condition, campus; sort by price
- [x] **Real-time Notifications**: In-app notification system with bell icon, mark-all-read, type-specific icons
- [x] **Image Upload to Cloud Storage**: Firebase Storage integration with upload/URL toggle, preview, 5MB limit
- [x] **Admin Role Assignment UI**: Super-admin can promote/demote any user via the Users tab
- [x] **Progressive Web App**: Service worker, offline caching (fonts, images), app shortcuts, install prompt
- [x] **Route Guards**: Protected routes requiring auth/verified/admin with loading spinners
- [x] **Toast Notification System**: Animated toasts for all user actions (success/error/warning/info)
- [x] **Web Share API**: Share listings via native OS share sheet or clipboard
- [x] **SEO Optimization**: Meta tags, Open Graph tags, semantic HTML

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Styling | TailwindCSS v4 |
| Animation | Motion (Framer Motion) |
| Icons | Lucide React |
| Auth | Firebase Authentication (Google) |
| Database | Cloud Firestore (real-time) |
| Storage | Firebase Cloud Storage |
| PWA | vite-plugin-pwa + Workbox |
| Server | Express.js (dev middleware) |

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The app runs on `http://localhost:3000` by default.

---

## 📁 Project Structure

```
src/
├── lib/
│   ├── firebase.ts          # Firebase init (Auth, Firestore, Storage)
│   ├── AuthContext.tsx       # Auth state provider
│   ├── ToastContext.tsx      # Toast notification system
│   ├── storage.ts           # Firebase Storage upload helpers
│   ├── notifications.ts     # In-app notification helpers
│   ├── firestore-errors.ts  # Error handling
│   └── utils.ts             # Tailwind merge utility
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx        # Nav with notification bell & wishlist
│   │   └── Footer.tsx
│   └── ui/
│       ├── ProtectedRoute.tsx # Route guards
│       └── NotificationBell.tsx
├── pages/
│   ├── LandingPage.tsx
│   ├── Auth/
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   └── Verification.tsx
│   └── Dashboard/
│       ├── Marketplace.tsx   # Advanced filters + wishlist
│       ├── ProductDetail.tsx # Transaction lifecycle + reviews
│       ├── SellItem.tsx      # Image upload + live preview
│       ├── Profile.tsx       # Real listings + stats
│       ├── AdminPanel.tsx    # Stats + role management
│       ├── ChatList.tsx
│       ├── ChatRoom.tsx      # Quick replies + report
│       ├── Wishlist.tsx
│       └── Notifications.tsx
└── mockData.ts
```
