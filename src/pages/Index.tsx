import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useRipple } from "@/hooks/useRipple";

const Index = () => {
  const { triggerRipple } = useRipple();

  const handleKeyRipple = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      triggerRipple({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <main className="w-full max-w-lg">
        <Card className="shadow-sm">
          <CardHeader>
            <h1 className="text-2xl font-semibold">WebGL Ripple Distortion Test</h1>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button
                variant="default"
                onKeyDown={handleKeyRipple}
                className="hover-scale"
              >
                Left Button Test
              </Button>
              <Button
                variant="secondary"
                onKeyDown={handleKeyRipple}
                className="hover-scale"
              >
                Right Button Test
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
