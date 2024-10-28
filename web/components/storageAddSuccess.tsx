import { Storage } from "@/lib/types";
import React, { } from "react";
import { Button } from "./ui/button";

export default function SuccessScreen({
    storage,
    onClose,
}: {
    storage: Storage;
    onClose: () => void;
}) {
    return (
        <div>
            <div className='flex items-center justify-center p-6 mb-4'>
                <div className="text-green-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className='font-medium pl-1 text-sm'>
                    {storage.name}
                </div>
            </div>
            <div className="flex justify-center items-center">
                <Button variant='default' size='lg' className='ml-2' onClick={onClose}>Done</Button>
            </div>
        </div>)
}
