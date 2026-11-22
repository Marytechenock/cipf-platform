import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, PlusCircle } from 'lucide-react';

interface CarouselItem {
  id: string;
  url: string;
  caption: string;
  description?: string;
}

interface CarouselProps {
  images: CarouselItem[];
  isAdmin?: boolean;
  onAddImageClick?: () => void;
}

export default function Carousel({ images, isAdmin = false, onAddImageClick }: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Auto-play interval
  useEffect(() => {
    if (images.length <= 1 || isHovered) return;
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000); // Auto-slide every 5 seconds
    return () => clearInterval(interval);
  }, [images.length, isHovered]);

  if (!images || images.length === 0) {
    return (
      <div className="flex h-72 md:h-96 w-full flex-col items-center justify-center rounded-2xl bg-gray-900 border border-dashed border-gray-700 p-6 text-center text-gray-400">
        <Sparkles className="h-10 w-10 text-amber-500/60 mb-3 animate-pulse" />
        <p className="text-sm font-semibold text-white">No Slideshow Images Available</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm">
          Please upload or assign showcase images from the Admin Panel to display the slideshow.
        </p>
        {isAdmin && onAddImageClick && (
          <button
            onClick={onAddImageClick}
            className="mt-4 flex items-center gap-1.5 rounded-full bg-[#B8922A] px-4 py-1.5 text-xs font-bold text-black hover:bg-amber-500 shadow transition-all"
          >
            <PlusCircle className="h-4 w-4" /> Upload Showcase Image
          </button>
        )}
      </div>
    );
  }

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length);
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
  };

  // Mobile Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const currentX = e.touches[0].clientX;
    const diff = touchStartX.current - currentX;

    if (Math.abs(diff) > 50) { // threshold of 50px for swipe action
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
      touchStartX.current = null; // Reset
    }
  };

  return (
    <div 
      className="relative overflow-hidden rounded-2xl bg-black shadow-2xl group w-full h-80 sm:h-96 md:h-[420px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      id="main-slideshow"
    >
      {/* Dynamic Slide Background (Fade Loop) */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none bg-black">
        {images.map((img, idx) => (
          <div
            key={img.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              idx === currentIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <img
              src={img.url}
              alt={img.caption}
              className="w-full h-full object-cover object-top-[0.65] brightness-[0.99]"
              referrerPolicy="no-referrer"
            />
          </div>
        ))}
      </div>

      {/* Modern Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/30 pointer-events-none z-10" />

      {/* Manual Arrow Controls (Appear on Hover in Desktop, always visible on touch devices) */}
      <button
        onClick={handlePrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 hover:bg-black/80 hover:scale-105 hover:border-[#FFD700] text-white hover:text-[#FFD700] border border-white/10 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-350"
        title="Previous Show Slide"
        id="carousel-btn-prev"
      >
        <ChevronLeft className="h-6 w-6 stroke-[2]" />
      </button>

      <button
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 hover:bg-black/80 hover:scale-105 hover:border-[#FFD700] text-white hover:text-[#FFD700] border border-white/10 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-350"
        title="Next Show Slide"
        id="carousel-btn-next"
      >
        <ChevronRight className="h-6 w-6 stroke-[2]" />
      </button>

      {/* Slide Info & Caption Overlay */}
      <div className="absolute bottom-6 left-6 right-6 z-20 flex flex-col md:flex-row md:items-end justify-between gap-4 pointer-events-auto">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1 rounded bg-[#FFD700] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#1A1A1A]">
            SHOWCASE Victoria Falls
          </span>
          <h3 className="mt-2 text-lg sm:text-xl md:text-2xl font-black text-white leading-tight tracking-tight drop-shadow-md">
            {images[currentIndex].caption}
          </h3>
          <p className="text-xs text-gray-300 mt-1.5 font-medium leading-relaxed max-w-lg">
            {images[currentIndex].description || 'Event highlights from Victoria Falls, showcasing MAZ professional development, networking, and business growth moments.'}
          </p>
        </div>

        {/* Dynamic Controls indicators */}
        <div className="flex items-center gap-1.5 shrink-0">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-8 bg-[#FFD700]' : 'w-2.5 bg-gray-600 hover:bg-gray-400'
              }`}
              title={`Jump to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Quick Indicator Badge on top */}
      <div className="absolute top-4 right-4 z-20 rounded-md bg-black/60 px-2.5 py-1 text-[10px] font-bold tracking-widest text-[#FFD700]">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
}
