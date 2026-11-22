declare module '*.jpeg';
declare module '*.jpg';
declare module '*.png';
declare module '*.gif';
declare module '*.avif';
declare module '*.svg' {
  const source: string;
  export default source;
}
