'use client'

import { ClientListItem } from "@/actions/client.actions";
import { Car } from "lucide-react";
import Link from "next/link";

export default function ClientsTable({ clients }: { clients: ClientListItem[] }) {
    return (
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Completo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DNI/CUIT</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coches Activos</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50 transition duration-100">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {client.fullName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {client.dni || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {client.phone}
                            <br />
                            <span className="text-xs text-gray-400">{client.email}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700">
                            {client.activeCarsCount} <Car className="w-4 h-4 inline-block ml-1 text-blue-500" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <Link href={`/dashboard/clients/${client.id}`} className="text-blue-600 hover:text-blue-900 transition duration-150">Ver Detalle</Link>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}