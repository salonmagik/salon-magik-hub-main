import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";

export function LandingFooter() {
  return (
    <footer className="border-t py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <SalonMagikLogo size="md" />
            <p className="text-sm text-muted-foreground mt-4 max-w-sm">
              The booking and business management platform built specifically 
              for African beauty professionals.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/pricing" className="hover:text-foreground transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/support" className="hover:text-foreground transition-colors">
                  Support
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Salon Magik. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
