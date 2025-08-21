import { useState } from "react";

export function Switch({
  checked = false,
  onChange,
  disabled = false,
  size = "md",
  color = "blue",
  label,
  id,
  name,
  className = "",
  showLabels = true,
  onLabel = "ON",
  offLabel = "OFF",
}) {
  // Size configurations
  const sizeClasses = {
    sm: {
      container: "h-5 w-9",
      circle: "h-3 w-3",
      translate: "translate-x-5",
      translateOff: "translate-x-1",
    },
    md: {
      container: "h-8 w-14",
      circle: "h-6 w-6",
      translate: "translate-x-7",
      translateOff: "translate-x-1",
    },
    lg: {
      container: "h-10 w-18",
      circle: "h-8 w-8",
      translate: "translate-x-9",
      translateOff: "translate-x-1",
    },
  };

  // Color configurations
  const colorClasses = {
    blue: "bg-blue-500 focus:ring-blue-500",
    green: "bg-green-500 focus:ring-green-500",
    purple: "bg-purple-500 focus:ring-purple-500",
    red: "bg-red-500 focus:ring-red-500",
    indigo: "bg-indigo-500 focus:ring-indigo-500",
    pink: "bg-pink-500 focus:ring-pink-500",
  };

  const sizeConfig = sizeClasses[size];
  const colorConfig = colorClasses[color];

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {showLabels && (
        <span
          className={`text-sm font-medium ${
            !checked ? "text-gray-900" : "text-gray-400"
          } ${disabled ? "opacity-50" : ""}`}
        >
          {offLabel}
        </span>
      )}

      <button
        id={id}
        name={name}
        onClick={() => !disabled && onChange && onChange(!checked)}
        disabled={disabled}
        className={`
          relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2
          ${checked ? colorConfig : "bg-gray-300"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${sizeConfig.container}
        `}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-disabled={disabled}
      >
        <span
          className={`
            inline-block transform rounded-full bg-white shadow-lg transition-transform duration-200 ease-in-out
            ${checked ? sizeConfig.translate : sizeConfig.translateOff}
            ${sizeConfig.circle}
          `}
        />
      </button>

      {showLabels && (
        <span
          className={`text-sm font-medium ${
            checked ? "text-gray-900" : "text-gray-400"
          } ${disabled ? "opacity-50" : ""}`}
        >
          {onLabel}
        </span>
      )}
    </div>
  );
}
