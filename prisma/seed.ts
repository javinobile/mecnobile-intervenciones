// prisma/seed.ts

import prisma from "../lib/prisma";

async function main() {
  console.log('Iniciando inserción de datos de prueba...');

  // --- 1. CREACIÓN DEL USUARIO STAFF ---
  // Necesitas al menos un usuario Staff (MECHANIC) para que las Server Actions funcionen.
  // Si ya tienes usuarios, puedes omitir esta sección o ajustar el email.
  const staffUser = await prisma.user.upsert({
    where: { email: 'mecanico.test@taller.com' },
    update: {},
    create: {
      email: 'mecanico.test@taller.com',
      name: 'Jorge El Mecánico',
      role: 'MECHANIC',
      // No necesita passwordHash si usas NextAuth, pero lo dejamos vacío si es obligatorio
      // passwordHash: 'hashed_password_placeholder',
    },
  });
  console.log(`Usuario Staff creado con ID: ${staffUser.id}`);


  // --- 2. CREACIÓN DE CLIENTES ---

  const client1 = await prisma.client.create({
    data: {
      firstName: 'Laura',
      lastName: 'Giménez',
      phone: '1123456789',
      email: 'laura.gimenez@email.com',
      address: 'Calle Falsa 123',
    },
  });

  const client2 = await prisma.client.create({
    data: {
      firstName: 'Marcelo',
      lastName: 'Pereyra',
      phone: '1198765432',
      email: 'marcelo.pereyra@email.com',
    },
  });
  console.log(`Clientes creados: ${client1.id}, ${client2.id}`);


  // --- 3. CREACIÓN DE VEHÍCULOS ---

  // Vehículo 1: Propiedad simple
  const car1 = await prisma.car.create({
    data: {
      licensePlate: 'ABC-123',
      vin: 'VIN0000000000001',
      make: 'Ford',
      model: 'Focus',
      year: 2018,
      color: 'Gris Plata',
      initialKm: 55000,
    },
  });

  // Vehículo 2: Propiedad que usaremos para OT
  const car2 = await prisma.car.create({
    data: {
      licensePlate: 'XYZ-987',
      vin: 'VIN0000000000002',
      make: 'Renault',
      model: 'Clio',
      year: 2010,
      color: 'Azul',
      initialKm: 125000,
    },
  });
  console.log(`Vehículos creados: ${car1.id}, ${car2.id}`);


  // --- 4. CREACIÓN DE LAS RELACIONES DE PROPIEDAD ACTUAL (CarOwnership) ---
  
  // Car 1 es de Laura (Dueño Actual)
  await prisma.carOwnership.create({
    data: {
      carId: car1.id,
      clientId: client1.id,
      startDate: new Date(),
      endDate: null, // <-- ESTO INDICA QUE ES EL DUEÑO ACTUAL
    },
  });
  
  // Car 2 es de Marcelo (Dueño Actual)
  await prisma.carOwnership.create({
    data: {
      carId: car2.id,
      clientId: client2.id,
      startDate: new Date(),
      endDate: null, // <-- DUEÑO ACTUAL
    },
  });

  console.log('Relaciones de propiedad creadas correctamente (Dueño Actual).');
  
  // --- 5. (OPCIONAL) CREACIÓN DE UNA OT PARA PROBAR EL LISTADO ---
  
  const intervention1 = await prisma.intervention.create({
      data: {
          otNumber: 1,
          carId: car2.id, // Usamos el Clio de Marcelo
          description: 'El embrague está muy duro y huele a quemado.',
          notes: 'Posible cambio completo de kit de embrague. Revisar volante bimasa.',
          mileageKm: 125100,
          performedById: staffUser.id,
          status: 'PENDING_PAYMENT', // Usamos un estado que existe en el enum
      }
  });
  
  console.log(`OT de prueba #${intervention1.otNumber} creada.`);

}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });