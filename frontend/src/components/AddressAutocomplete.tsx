/**
 * Google Places address autocomplete input.
 *
 * Renders a standard shadcn Input. When the Google Places API is available,
 * shows a dropdown of address suggestions as the user types. Selecting a
 * suggestion fires `onSelect` with parsed street, city, state, and zip.
 *
 * Uses the modern AutocompleteSuggestion API (not legacy AutocompleteService).
 *
 * Graceful degradation: if the API key is missing or the API fails to load,
 * the component works as a normal text input with no visual difference.
 */

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useGooglePlaces, type ParsedAddress, type Prediction } from "@/hooks/useGooglePlaces";
import { MapPin } from "lucide-react";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  id,
  disabled,
}: AddressAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [skipFetch, setSkipFetch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const { ready, predictions, clearPredictions, selectPrediction, init } =
    useGooglePlaces({ input: value, skip: skipFetch });

  // Show dropdown when we have predictions
  useEffect(() => {
    if (predictions.length > 0) {
      setIsOpen(true);
      setActiveIndex(-1);
    } else {
      setIsOpen(false);
    }
  }, [predictions]);

  // Re-enable fetching when user types (value changes from user input)
  const handleInputChange = useCallback(
    (newValue: string) => {
      setSkipFetch(false);
      onChange(newValue);
    },
    [onChange],
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    async (prediction: Prediction) => {
      // Suppress fetching until next user keystroke
      setSkipFetch(true);
      setIsOpen(false);
      clearPredictions();

      // Immediately show the selected address text
      onChange(prediction.fullText);

      const parsed = await selectPrediction(prediction);
      if (parsed) {
        onSelect(parsed);
      }
    },
    [onChange, onSelect, selectPrediction, clearPredictions],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || predictions.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < predictions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : predictions.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < predictions.length) {
            handleSelect(predictions[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, predictions, activeIndex, handleSelect],
  );

  const activeDescendant =
    activeIndex >= 0 && activeIndex < predictions.length
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={init}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
        role={ready ? "combobox" : undefined}
        aria-expanded={ready ? isOpen : undefined}
        aria-autocomplete={ready ? "list" : undefined}
        aria-controls={ready ? listboxId : undefined}
        aria-activedescendant={activeDescendant}
      />

      {isOpen && predictions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Address suggestions"
          className={cn(
            "absolute z-50 mt-1 w-full overflow-auto",
            "rounded-md border bg-popover text-popover-foreground shadow-md",
            "animate-fade-in",
          )}
          style={{ maxHeight: "240px" }}
        >
          {predictions.map((prediction, index) => (
            <button
              type="button"
              key={prediction.placeId}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              ref={(el) => {
                if (index === activeIndex && el) {
                  el.scrollIntoView({ block: "nearest" });
                }
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm text-left",
                "outline-none cursor-default transition-colors",
                index === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 hover:text-accent-foreground",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent input blur
                handleSelect(prediction);
              }}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  {prediction.mainText}
                </span>
                {prediction.secondaryText && (
                  <span className="text-muted-foreground ml-1 text-xs">
                    {prediction.secondaryText}
                  </span>
                )}
              </div>
            </button>
          ))}

          {/* Google attribution (required by TOS) */}
          <div className="flex items-center justify-end px-3 py-1.5 border-t border-border">
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3_hdpi.png"
              alt="Powered by Google"
              className="h-3 dark:hidden"
            />
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-non-white3_hdpi.png"
              alt="Powered by Google"
              className="h-3 hidden dark:block"
            />
          </div>
        </div>
      )}
    </div>
  );
}
