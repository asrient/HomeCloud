import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { PageUIConfig, SidebarType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function nameToInitials(name: string) {
  const parts = name.split(" ")
  return parts.map((part) => part[0]).join("").toUpperCase();
}

export function openExternalLink(url: string) {
  window.open(url, "_blank")
}

export function buildPageConfig(sidebarType?: SidebarType, noAppShell = false): PageUIConfig {
  return {
    sidebarType,
    noAppShell,
  }
}

export function isMobile() {
  return window.innerWidth < 768
}
