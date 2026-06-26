import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from './firebase';

export interface RealSchool {
  name: string;
}

export interface RealProduct {
  id: string;
  title: string;
  price: number;
  condition: string;
  category: string;
  sellerName: string;
  sellerSchool: string;
  image?: string;
}

export interface RealUser {
  id: string;
  name: string;
  school: string;
  reputation: number;
  profilePicture?: string;
}

export interface LandingStats {
  totalUsers: number;
  totalProducts: number;
  totalSchools: number;
}

/* ── Seed / Fallback Data ────────────────────────── */

const SEED_SCHOOLS: string[] = [
  'Loreto Convent Lucknow', 'La Martinière College Lucknow', 'CMS Gomtinagar - 1',
  'La Martinière Girls\' College', 'CMS Cambridge', 'St. Francis Lucknow',
  'Seth M.R. Jaipuria School', 'Delhi Public School Jankipuram',
  'Cathedral Sr. Sec. School', 'St. Mary\'s Convent', 'City Montessori School',
  'Stella Maris Academy', 'Spring Dale College', 'St. Paul\'s Academy',
  'St. John\'s School', 'St. Xavier\'s College', 'Army Public School',
  'Guru Nanak Girls Inter College', 'Avadh Collegiate', 'Queen\'s College',
  'St. Anthony\'s School', 'Christ Church College', 'Kendriya Vidyalaya No. 1',
  'Navy Children School', 'Maharishi Vidya Mandir', 'Brahmanand Public School',
  'St. Michael\'s School', 'Colonel\'s Academy', 'St. Agnes\' School',
  'Brightland School', 'Rani Laxmi Bai School', 'St. Joseph\'s College',
  'Little Flower School', 'St Bede\'s College', 'St. Mary\'s Academy',
  'Central Academy', 'Lucknow Public School', 'St. Fidelis School',
  'St. Teresa\'s School', 'St. Don Bosco College',
];

const SEED_NAMES = [
  'Aarav Sharma', 'Vivaan Singh', 'Aditya Verma', 'Vihaan Patel', 'Arjun Kumar',
  'Sai Gupta', 'Dhruv Reddy', 'Ayaan Joshi', 'Ansh Mishra', 'Ishaan Nair',
  'Reyansh Iyer', 'Kabir Menon', 'Krishna Desai', 'Shaurya Rao', 'Yash Kapoor',
  'Aadhya Iyengar', 'Ananya Gupta', 'Diya Saxena', 'Ishita Agarwal', 'Jiya Mehra',
  'Kiara Bhatt', 'Navya Rajan', 'Pari Dubey', 'Sara Khan', 'Myra Chopra',
  'Shanaya Trivedi', 'Anika Purohit', 'Aaradhya Wagh', 'Nandini Shetty',
  'Nishita Tiwari', 'Saurabh Tiwari', 'Hia Mishra', 'Sujal Negi', 'Abdus Samad',
  'Rohan Gupta', 'Priya Verma', 'Aryan Sharma', 'Kabir Singh', 'Siddharth Menon',
  'Tanya Kapoor', 'Aditi Roy', 'Rahul Jain', 'Neha Patel', 'Vishal Nair',
];

const SEED_CATEGORIES = ['Books', 'Notes', 'Electronics', 'Uniforms', 'JEE/NEET Modules', 'Sports Gear', 'Hostel Essentials'];

const SEED_CONDITIONS = ['Brand New', 'Like New', 'Good', 'Used'];
const SEED_PRODUCT_TEMPLATES = [
  { title: 'Concepts of Physics - HC Verma', category: 'Books', price: 350, image: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=800' },
  { title: 'NEET Biology Handwritten Notes', category: 'Notes', price: 799, image: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&q=80&w=800' },
  { title: 'TI-84 Plus CE Calculator', category: 'Electronics', price: 4500, image: 'https://images.unsplash.com/photo-1611078716875-9c5957d383b7?auto=format&fit=crop&q=80&w=800' },
  { title: 'Winter Blazer - Size 38', category: 'Uniforms', price: 1200, image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=800' },
  { title: 'JEE Advanced 2025 Modules Complete Set', category: 'JEE/NEET Modules', price: 3200, image: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=800' },
  { title: 'Oxford Handbook of Clinical Medicine', category: 'Books', price: 650, image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=800' },
  { title: 'Class 12 Chemistry Revision Notes', category: 'Notes', price: 499, image: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&q=80&w=800' },
  { title: 'Scientific Calculator fx-991EX', category: 'Electronics', price: 1800, image: 'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?auto=format&fit=crop&q=80&w=800' },
  { title: 'School Sports Jersey - M Size', category: 'Sports Gear', price: 450, image: 'https://images.unsplash.com/photo-1502224562085-6dde1133b413?auto=format&fit=crop&q=80&w=800' },
  { title: 'Hostel Bedsheet Set - Single Bed', category: 'Hostel Essentials', price: 899, image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&q=80&w=800' },
  { title: 'Organic Chemistry - Morrison & Boyd', category: 'Books', price: 420, image: 'https://images.unsplash.com/photo-1633613286848-e6f43bbafb84?auto=format&fit=crop&q=80&w=800' },
  { title: 'Physics Galaxy 2026 Study Material', category: 'JEE/NEET Modules', price: 2800, image: 'https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?auto=format&fit=crop&q=80&w=800' },
  { title: 'College ID Card Holder + Lanyard', category: 'Hostel Essentials', price: 199, image: 'https://images.unsplash.com/photo-1627582570077-7e61e0129037?auto=format&fit=crop&q=80&w=800' },
  { title: 'DSLR Camera Tripod', category: 'Electronics', price: 1600, image: 'https://images.unsplash.com/photo-1587391993475-104928b9cc67?auto=format&fit=crop&q=80&w=800' },
  { title: 'School Tie & Belt Combo', category: 'Uniforms', price: 350, image: 'https://images.unsplash.com/photo-1585699478498-3162fb1658b4?auto=format&fit=crop&q=80&w=800' },
  { title: 'JEE Main 2025 Solved Papers', category: 'JEE/NEET Modules', price: 750, image: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&q=80&w=800' },
  { title: 'Basketball - Size 7 Official', category: 'Sports Gear', price: 1100, image: 'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&q=80&w=800' },
  { title: 'Hostel Extension Cord + USB Hub', category: 'Hostel Essentials', price: 599, image: 'https://images.unsplash.com/photo-1558231221-1277a0af052b?auto=format&fit=crop&q=80&w=800' },
  { title: 'RD Sharma Class 12 Mathematics', category: 'Books', price: 520, image: 'https://images.unsplash.com/photo-1633613286950-ec2e3bf4a92c?auto=format&fit=crop&q=80&w=800' },
  { title: 'NEET Previous Year Questions Bank', category: 'JEE/NEET Modules', price: 1290, image: 'https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?auto=format&fit=crop&q=80&w=800' },
  { title: 'Badminton Racket Set', category: 'Sports Gear', price: 850, image: 'https://images.unsplash.com/photo-1622279457486-63d7306b1858?auto=format&fit=crop&q=80&w=800' },
  { title: 'Hostel Storage Organizer Set', category: 'Hostel Essentials', price: 699, image: 'https://images.unsplash.com/photo-1595514535312-d27845347ff5?auto=format&fit=crop&q=80&w=800' },
  { title: 'College Blazer - L Size', category: 'Uniforms', price: 1500, image: 'https://images.unsplash.com/photo-1594938328870-9623159c8c99?auto=format&fit=crop&q=80&w=800' },
  { title: 'Wireless Bluetooth Earbuds', category: 'Electronics', price: 2200, image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&q=80&w=800' },
  { title: 'NCERT Physics - Class 11 & 12 (Set of 5)', category: 'Books', price: 1200, image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=800' },
  { title: 'Periodic Table Wall Chart', category: 'Notes', price: 149, image: 'https://images.unsplash.com/photo-1531685250784-af58704d27c1?auto=format&fit=crop&q=80&w=800' },
  { title: 'Cricket Bat - Kashmir Willow', category: 'Sports Gear', price: 2100, image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&q=80&w=800' },
  { title: 'USB-C Hub 7-in-1', category: 'Electronics', price: 1400, image: 'https://images.unsplash.com/photo-1616421998980-87ef1c60f1ad?auto=format&fit=crop&q=80&w=800' },
  { title: 'School Cap & Badge Set', category: 'Uniforms', price: 250, image: 'https://images.unsplash.com/photo-1589828133502-86111e037bce?auto=format&fit=crop&q=80&w=800' },
  { title: 'AIIMS 2025 Biology Module', category: 'JEE/NEET Modules', price: 1600, image: 'https://images.unsplash.com/photo-1603354350317-6f7aaaa2d145?auto=format&fit=crop&q=80&w=800' },
];

/* ── Generate seed products from templates ──────── */

function generateSeedProducts(count: number): RealProduct[] {
  const shuffled = [...SEED_PRODUCT_TEMPLATES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((t, i) => ({
    id: `seed-${i}`,
    title: t.title,
    price: t.price + Math.floor(Math.random() * 200) - 100,
    condition: SEED_CONDITIONS[Math.floor(Math.random() * SEED_CONDITIONS.length)],
    category: t.category,
    sellerName: SEED_NAMES[Math.floor(Math.random() * SEED_NAMES.length)],
    sellerSchool: SEED_SCHOOLS[Math.floor(Math.random() * SEED_SCHOOLS.length)],
    image: (t as any).image,
  }));
}

function generateSeedUsers(count: number): RealUser[] {
  return Array.from({ length: count }, (_, i) => {
    const name = SEED_NAMES[i % SEED_NAMES.length];
    return {
      id: `seed-user-${i}`,
      name,
      school: SEED_SCHOOLS[Math.floor(Math.random() * SEED_SCHOOLS.length)],
      reputation: +(4.5 + Math.random() * 0.5).toFixed(1),
    };
  });
}

/* ── localStorage Cache ──────────────────────────── */

const CACHE_PREFIX = 'nb_landing_v4_';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function getFromCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — skip
  }
}

/* ── Fetch Functions (with fallback chain) ───────── */

export async function fetchSchools(): Promise<RealSchool[]> {
  const cached = getFromCache<RealSchool[]>('schools');
  if (cached) return cached;

  try {
    const snap = await getDocs(query(collection(db, 'schools'), limit(100)));
    const data = snap.docs.map(d => ({ name: d.data().name || d.id }));
    if (data.length > 0) {
      setCache('schools', data);
      return data;
    }
  } catch {}
  return SEED_SCHOOLS.map(name => ({ name }));
}

export async function fetchLandingUsers(): Promise<RealUser[]> {
  const cached = getFromCache<RealUser[]>('users');
  if (cached) return cached;

  try {
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('verified', '==', true),
        where('profilePicture', '!=', null),
        limit(60)
      )
    );
    if (!snap.empty) {
      const data = snap.docs.map(d => {
        const u = d.data();
        return {
          id: d.id,
          name: u.name || 'Student',
          school: u.school || '',
          reputation: u.reputation || 5.0,
          profilePicture: u.profilePicture || undefined,
        };
      });
      setCache('users', data);
      return data;
    }
  } catch {}
  return generateSeedUsers(40);
}

export async function fetchVerifiedUserCount(): Promise<number> {
  const cached = getFromCache<number>('verifiedCount');
  if (cached !== null) return cached;

  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('verified', '==', true), limit(1000))
    );
    const count = snap.size;
    if (count > 0) {
      setCache('verifiedCount', count);
      return count;
    }
  } catch {}
  return 200;
}

export async function fetchRecentProducts(): Promise<RealProduct[]> {
  const cached = getFromCache<RealProduct[]>('products');
  if (cached) return cached;

  try {
    const snap = await getDocs(
      query(
        collection(db, 'products'),
        where('status', '==', 'available'),
        orderBy('createdAt', 'desc'),
        limit(30)
      )
    );
    if (!snap.empty) {
      const data = snap.docs.map(d => {
        const p = d.data();
        return {
          id: d.id,
          title: p.title,
          price: p.price,
          condition: p.condition,
          category: p.category,
          sellerName: p.sellerName,
          sellerSchool: p.sellerSchool,
          image: p.image || undefined,
        };
      });
      setCache('products', data);
      return data;
    }
  } catch {}
  const seeds = generateSeedProducts(30);
  setCache('products', seeds);
  return seeds;
}

export async function fetchUserCount(): Promise<number> {
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(1000)));
    return snap.size;
  } catch {
    return 200;
  }
}

export async function fetchProductCount(): Promise<number> {
  try {
    const snap = await getDocs(query(collection(db, 'products'), limit(1000)));
    return snap.size;
  } catch {
    return 350;
  }
}

export async function fetchSchoolCount(): Promise<number> {
  try {
    const snap = await getDocs(query(collection(db, 'schools'), limit(1000)));
    return snap.size;
  } catch {
    return SEED_SCHOOLS.length;
  }
}

export async function fetchLandingStats(): Promise<LandingStats> {
  const cached = getFromCache<LandingStats>('stats');
  if (cached) return cached;

  try {
    const [usersSnap, productsSnap, schoolsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), limit(1000))),
      getDocs(query(collection(db, 'products'), limit(1000))),
      getDocs(query(collection(db, 'schools'), limit(1000))),
    ]);
    const stats = {
      totalUsers: usersSnap.size,
      totalProducts: productsSnap.size,
      totalSchools: schoolsSnap.size,
    };
    if (stats.totalUsers > 0 || stats.totalSchools > 0) {
      setCache('stats', stats);
      return stats;
    }
  } catch {}
  return { totalUsers: 200, totalProducts: 350, totalSchools: SEED_SCHOOLS.length };
}

/* ── Quick cache warmer (call on app mount) ──────── */

export function warmLandingCache(): void {
  // Intentionally left empty. 
  // Previously this poisoned the cache with seed data, preventing live Firestore queries.
}
