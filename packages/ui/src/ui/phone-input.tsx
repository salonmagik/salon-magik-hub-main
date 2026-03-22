import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@shared/utils";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ui/popover";
import { ScrollArea } from "@ui/scroll-area";
import {
  Country,
  COUNTRIES,
  PRIORITY_COUNTRIES,
  DEFAULT_COUNTRY,
  formatToE164,
  parseE164,
} from "@shared/countries";

export interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  defaultCountry?: string;
  allowedCountryCodes?: string[];
  excludeCountryCodes?: string[];
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
      allowedCountryCodes,
      excludeCountryCodes,
      placeholder = "Phone number",
      disabled = false,
      hasError = false,
      className,
    },
    ref
  ) => {
    const filteredCountries = React.useMemo(() => {
      const allowedSet = allowedCountryCodes?.length
        ? new Set(allowedCountryCodes.map((code) => code.toUpperCase()))
        : null;
      const excludedSet = excludeCountryCodes?.length
        ? new Set(excludeCountryCodes.map((code) => code.toUpperCase()))
        : null;

      return COUNTRIES.filter((country) => {
        if (allowedSet && !allowedSet.has(country.code.toUpperCase())) return false;
        if (excludedSet && excludedSet.has(country.code.toUpperCase())) return false;
        return true;
      });
    }, [allowedCountryCodes, excludeCountryCodes]);

    const [open, setOpen] = React.useState(false);
    const [selectedCountry, setSelectedCountry] = React.useState<Country>(() => {
      const defaultMatch = filteredCountries.find(
        (country) => country.code === defaultCountry.toUpperCase()
      );
      return defaultMatch || filteredCountries[0] || DEFAULT_COUNTRY;
    });
    const [nationalNumber, setNationalNumber] = React.useState("");

    React.useEffect(() => {
      if (!filteredCountries.some((country) => country.code === selectedCountry.code)) {
        setSelectedCountry(filteredCountries[0] || DEFAULT_COUNTRY);
      }
    }, [filteredCountries, selectedCountry.code]);

    // Initialize from value prop (E.164 format)
    React.useEffect(() => {
      if (value) {
        const parsed = parseE164(value);
        if (parsed) {
          const country = filteredCountries.find(
            (c) => c.dialCode === parsed.dialCode
          );
          if (country) {
            setSelectedCountry(country);
            setNationalNumber(parsed.nationalNumber);
          }
        }
      }
    }, [value, filteredCountries]);

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
    const popularCountries = PRIORITY_COUNTRIES.filter((country) =>
      filteredCountries.some((item) => item.code === country.code)
    );
    const otherCountries = filteredCountries.filter(
      (c) => !popularCountries.some((p) => p.code === c.code)
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
                  {popularCountries.length > 0 && (
                    <CommandGroup heading="Popular">
                      {popularCountries.map((country) => (
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
                  )}
                  <CommandGroup heading={popularCountries.length > 0 ? "All Countries" : "Countries"}>
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
