import { DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";

export function DialogHeaderView({
    title,
    description,
    iconUrl,
    iconView,
}: {
    title: string;
    description?: string;
    iconUrl?: string;
    iconView?: React.ReactNode;
}) {
    return (
        <DialogHeader className="md:flex-row">
            <div className="flex items-center justify-center p-1 md:pr-4">
                {iconUrl ? (
                    <Image src={iconUrl} alt={title} width={48} height={48} />
                ) : (
                    <div className="h-[3rem] w-[3rem] rounded-md bg-purple-500 text-white flex items-center justify-center">
                        {iconView || (<span className="text-2xl">?</span>)}
                    </div>)}
            </div>
            <div className="grow flex-col flex justify-center">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>
                    {description}
                </DialogDescription>
            </div>
        </DialogHeader>
    );
}
