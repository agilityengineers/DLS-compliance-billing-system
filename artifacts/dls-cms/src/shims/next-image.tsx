// Shim for `next/image` — renders a plain <img>, stripping Next-only props.
import type { CSSProperties, ImgHTMLAttributes } from "react";

type NextImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  alt?: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
  unoptimized?: boolean;
  sizes?: string;
  style?: CSSProperties;
};

export default function Image({
  src,
  alt = "",
  width,
  height,
  fill,
  priority,
  quality,
  placeholder,
  blurDataURL,
  loader,
  unoptimized,
  sizes,
  style,
  ...rest
}: NextImageProps) {
  const resolvedSrc = typeof src === "string" ? src : src?.src ?? "";
  const resolvedStyle: CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style }
    : style ?? {};
  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : (width as number | undefined)}
      height={fill ? undefined : (height as number | undefined)}
      sizes={sizes}
      style={resolvedStyle}
      {...rest}
    />
  );
}
