import Link from "next/link";
import { Github, ExternalLink } from "lucide-react";

interface FooterProps {
  variant?: "fixed" | "static";
}

export function Footer({ variant = "fixed" }: FooterProps) {
  return (
    <footer
      className={`w-full border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50 ${
        variant === "fixed" ? "fixed bottom-0 left-0 right-0" : "static"
      }`}
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          
          {/* Project */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted">
              <Github className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm font-semibold">
                ResumeLM
              </p>
              <p className="text-xs text-muted-foreground">
                AI-powered resume builder
              </p>
            </div>
          </div>

          {/* GitHub */}
          <div className="flex items-center gap-3">
            <Link
              href="https://github.com/BhanuPrakash2250"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Github className="h-4 w-4" />
              GitHub
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>

            <span className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} ResumeLM
            </span>
          </div>

        </div>
      </div>
    </footer>
  );
}