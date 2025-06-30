import Image from "next/image";

export function EmptyPlaceholder({
    iconUrl, text,
}: {
    iconUrl: string;
    text: string;
}) {
    return (<div className="flex space-y-1 p-2 flex-col w-full justify-center items-center text-foreground/60 text-xs">
        <div>
            <Image src={iconUrl} alt="Empty" height={55} width={55} />
        </div>
        <div>{text}</div>
    </div>);
}
