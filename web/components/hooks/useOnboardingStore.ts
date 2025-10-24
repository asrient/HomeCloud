import { create } from 'zustand'

type OnboardingPage = 'welcome' | 'login' | null

export type OnboardingPageOpts = {
    reloadOnFinish: boolean
}

interface OnboardingState {
    page: OnboardingPage
    opts: OnboardingPageOpts

    openDialog: (page: OnboardingPage, opts?: OnboardingPageOpts) => void
    closeDialog: () => void
}

const defaultOnboardingOpts: OnboardingPageOpts = {
    reloadOnFinish: false
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
    page: null,
    opts: defaultOnboardingOpts,
    openDialog: (page: OnboardingPage, opts?: OnboardingPageOpts) => set({ page, opts: opts || defaultOnboardingOpts }),
    closeDialog: () => set({ page: null, opts: defaultOnboardingOpts })
}))
