"use client";

export function FacebookAdPreview({ src, title, width, height }: {
  src: string;
  title: string;
  width?: number | null;
  height?: number | null;
}) {
  const naturalWidth = Math.max(280, width ?? 340);
  const completeHeight = Math.max(700, height ?? 0);

  return (
    <div
      className="ci-facebook-preview"
      data-facebook-preview="true"
      style={{ width: `min(100%, ${naturalWidth}px)` }}
    >
      <iframe
        src={src}
        title={title}
        width={naturalWidth}
        height={completeHeight}
        scrolling="yes"
        style={{ border: 0, display: "block", width: "100%", height: completeHeight }}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
      />
    </div>
  );
}
