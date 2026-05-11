export interface Product {
  id: string;
  title: string;
  price: number;
  condition: 'Brand New' | 'Like New' | 'Good' | 'Used';
  category: string;
  seller: {
    name: string;
    verified: boolean;
    reputation: number;
    school: string;
  };
  image: string;
  description: string;
  meetupAvailable: boolean;
  deliveryAvailable: boolean;
}

export const mockProducts: Product[] = [
  {
    id: '1',
    title: 'Concepts of Physics - HC Verma Vol 1',
    price: 350,
    condition: 'Like New',
    category: 'Books',
    seller: {
      name: 'Aryan Sharma',
      verified: true,
      reputation: 4.8,
      school: 'DPS RK Puram'
    },
    image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=1974&auto=format&fit=crop',
    description: 'Barely used, no markings or highlights. Original bill available.',
    meetupAvailable: true,
    deliveryAvailable: true
  },
  {
    id: '2',
    title: 'NEET Bio Chemistry Handwritten Notes',
    price: 799,
    condition: 'Good',
    category: 'Notes',
    seller: {
      name: 'Priya Verma',
      verified: true,
      reputation: 4.9,
      school: 'Modern School'
    },
    image: 'https://images.unsplash.com/photo-1517842645767-c639042777db?q=80&w=2070&auto=format&fit=crop',
    description: 'Comprehensive notes covering entire class 12 syllabus. Very neat handwriting.',
    meetupAvailable: true,
    deliveryAvailable: false
  },
  {
    id: '3',
    title: 'TI-84 Plus CE Graphing Calculator',
    price: 4500,
    condition: 'Good',
    category: 'Electronics',
    seller: {
      name: 'Kabir Singh',
      verified: true,
      reputation: 4.5,
      school: 'Welham Boys'
    },
    image: 'https://images.unsplash.com/photo-1543167603-9ef44416bcad?q=80&w=2070&auto=format&fit=crop',
    description: 'Perfect for SAT/ACT prep. Comes with charger and protective case.',
    meetupAvailable: true,
    deliveryAvailable: true
  },
  {
    id: '4',
    title: 'Heritage School Winter Blazer',
    price: 1200,
    condition: 'Used',
    category: 'Uniforms',
    seller: {
      name: 'Siddharth M.',
      verified: true,
      reputation: 4.7,
      school: 'The Heritage School'
    },
    image: 'https://images.unsplash.com/photo-1594932224828-b4b057bfe4f0?q=80&w=1964&auto=format&fit=crop',
    description: 'Size 38, well maintained. Only used for one season.',
    meetupAvailable: true,
    deliveryAvailable: false
  },
  {
    id: '5',
    title: 'Allen JEE Modules Full Set',
    price: 3200,
    condition: 'Good',
    category: 'JEE/NEET Modules',
    seller: {
      name: 'Rohan Gupta',
      verified: true,
      reputation: 4.6,
      school: 'Step by Step'
    },
    image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=2073&auto=format&fit=crop',
    description: 'Complete set of Phase 1 to 4. Some pencil markings in exercises.',
    meetupAvailable: true,
    deliveryAvailable: true
  }
];

export const categories = [
  'All',
  'Books',
  'JEE/NEET Modules',
  'Notes',
  'Electronics',
  'Uniforms',
  'Sports Gear',
  'Hostel Essentials',
  'Cycles',
  'Miscellaneous'
];
