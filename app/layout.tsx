import "./global.css"
import { ReactNode } from "react"

export const metadata = {
    title: "RoastGPT",
    description: "Get Roasted Today Bitch!"
}

interface RootLayoutProps {
    children: ReactNode
}

const RootLayout = ({ children }: RootLayoutProps) => {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}

export default RootLayout