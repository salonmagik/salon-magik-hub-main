import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Country,
  PRIORITY_COUNTRIES,
  ALL_COUNTRIES,
  DEFAULT_COUNTRY,
  formatToE164,
  parseE164,
  getCountryByCode,
} from "@/lib/countries";

export interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  defaultCountry?: string;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      value = "",
      onChange,
      defaultCountry = "NG",
      placeholder = "Phone number",
      disabled = false,
      hasError = false,
      className,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [selectedCountry, setSelectedCountry] = React.useState<Country>(
      getCountryByCode(defaultCountry) || DEFAULT_COUNTRY
    );
    const [nationalNumber, setNationalNumber] = React.useState("");

    // Initialize from value prop (E.164 format)
    React.useEffect(() => {
      if (value) {
        const parsed = parseE164(value);
        if (parsed) {
          const country = ALL_COUNTRIES.find(
            (c) => c.dialCode === parsed.dialCode
          );
          if (country) {
            setSelectedCountry(country);
            setNationalNumber(parsed.nationalNumber);
          }
        }
      }
    }, []);

    // Update parent when country or number changes
    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value.replace(/\D/g, "");
      setNationalNumber(input);

      if (onChange) {
        if (input) {
          onChange(formatToE164(selectedCountry.dialCode, input));
        } else {
          onChange("");
        }
      }
    };

    const handleCountrySelect = (country: Country) => {
      setSelectedCountry(country);
      setOpen(false);

      if (onChange && nationalNumber) {
        onChange(formatToE164(country.dialCode, nationalNumber));
      }
    };

    // Filter out priority countries from the all countries list to avoid duplicates
    const otherCountries = ALL_COUNTRIES.filter(
      (c) => !PRIORITY_COUNTRIES.some((p) => p.code === c.code)
    );

    return (
      <div
        className={cn(
          "flex h-11 w-full rounded-md border bg-background ring-offset-background",
          hasError ? "border-destructive" : "border-input",
          disabled && "cursor-not-allowed opacity-50",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          className
        )}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className={cn(
                "h-full flex-shrink-0 gap-1 rounded-l-md rounded-r-none border-r px-3",
                "hover:bg-accent focus:ring-0 focus:ring-offset-0"
              )}
            >
              <span className="text-lg leading-none">{selectedCountry.flag}</span>
              <span className="text-sm text-muted-foreground">
                {selectedCountry.dialCode}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search country..." />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <ScrollArea className="h-[300px]">
                  <CommandGroup heading="Popular">
                    {PRIORITY_COUNTRIES.map((country) => (
                      <CommandItem
                        key={country.code}
                        value={`${country.name} ${country.dialCode}`}
                        onSelect={() => handleCountrySelect(country)}
                      >
                        <span className="mr-2 text-lg">{country.flag}</span>
                        <span className="flex-1">{country.name}</span>
                        <span className="text-muted-foreground">
                          {country.dialCode}
                        </span>
                        {selectedCountry.code === country.code && (
                          <Check className="ml-2 h-4 w-4" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="All Countries">
                    {otherCountries.map((country) => (
                      <CommandItem
                        key={country.code}
                        value={`${country.name} ${country.dialCode}`}
                        onSelect={() => handleCountrySelect(country)}
                      >
                        <span className="mr-2 text-lg">{country.flag}</span>
                        <span className="flex-1">{country.name}</span>
                        <span className="text-muted-foreground">
                          {country.dialCode}
                        </span>
                        {selectedCountry.code === country.code && (
                          <Check className="ml-2 h-4 w-4" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </ScrollArea>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Input
          ref={ref}
          type="tel"
          inputMode="numeric"
          placeholder={placeholder}
          value={nationalNumber}
          onChange={handleNumberChange}
          disabled={disabled}
          className={cn(
            "h-full flex-1 rounded-l-none border-0",
            "focus-visible:ring-0 focus-visible:ring-offset-0"
          )}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
