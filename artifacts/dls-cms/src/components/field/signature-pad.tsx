// components/field/signature-pad.tsx — touch signature capture
"use client";

import { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function SignaturePad({
  label, value, onChange
}: {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const ref = useRef<SignatureCanvas>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button" variant="ghost" size="sm"
          onClick={() => { ref.current?.clear(); onChange(null); }}
        >
          Clear
        </Button>
      </div>
      {value ? (
        // Restored from auto-save: show the saved image; clear to re-sign.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={`${label} (saved)`} className="h-36 w-full rounded-md border border-border bg-white object-contain" />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-white">
          <SignatureCanvas
            ref={ref}
            penColor="#1e293b"
            canvasProps={{ className: "h-36 w-full", style: { touchAction: "none" } }}
            onEnd={() => onChange(ref.current?.getTrimmedCanvas().toDataURL("image/png") ?? null)}
          />
        </div>
      )}
    </div>
  );
}
