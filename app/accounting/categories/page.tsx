import { Metadata } from "next"
import CategoriesPageClient from "./categoriesClient"

export const metadata: Metadata = {
    title: "Category Management",
    description: "Manage accounting categories",
}

export default function CategoriesPage() {
    return <CategoriesPageClient />
}
