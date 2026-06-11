import { useEffect, useRef } from 'react';

export function useBiDirectionalSticky() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let currentTransform = 0;
    let ticking = false;

    const updateSticky = () => {
      if (!ref.current) return;
      const elementHeight = ref.current.getBoundingClientRect().height;
      const viewportHeight = window.innerHeight;
      
      const scrollY = window.scrollY;
      const deltaY = scrollY - lastScrollY;
      lastScrollY = scrollY;

      // Base padding from top (e.g. for the header)
      const topPadding = 0;

      // If sidebar is shorter than viewport, just stick to the top
      if (elementHeight + topPadding <= viewportHeight) {
        currentTransform = -topPadding;
        ref.current.style.top = `${topPadding}px`;
        ticking = false;
        return;
      }

      // Max transform needed to reach the bottom of the element
      const maxTransform = elementHeight - viewportHeight;

      currentTransform += deltaY;
      currentTransform = Math.max(-topPadding, Math.min(currentTransform, maxTransform));
      
      ref.current.style.top = `${-currentTransform}px`;
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateSticky);
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    
    // Initial setup
    if (ref.current) {
      ref.current.style.position = 'sticky';
      ref.current.style.alignSelf = 'flex-start';
      ref.current.style.willChange = 'top'; // optimize performance
    }
    updateSticky();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  return ref;
}
