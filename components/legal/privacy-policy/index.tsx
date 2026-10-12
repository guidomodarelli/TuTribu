/** Explains current data handling through a public, accessible information page. */
import { Link } from "@/components/navigation/link";
import { siteConfig } from "@/lib/site-config";
import { ROUTES } from "@/src/constants/routes";
import styles from "./styles.module.scss";

/** Renders service disclosures and the contact explicitly provided by its responsible person. */
export function PrivacyPolicy() {
  return (
    <main className={styles.PrivacyPolicy}>
      <Link href={ROUTES.home} className={styles.PrivacyPolicy__back}>Volver al inicio</Link>
      <header className={styles.PrivacyPolicy__header}>
        <p className={styles.PrivacyPolicy__eyebrow}>TuTribu</p>
        <h1 className={styles.PrivacyPolicy__title}>Política de privacidad</h1>
        <p className={styles.PrivacyPolicy__intro}>Esta página explica qué datos utiliza TuTribu para que puedas acceder a tu cuenta, participar en tribus y usar sus herramientas.</p>
        <p className={styles.PrivacyPolicy__text}>Responsable del servicio: {siteConfig.privacy.responsibleName}. Para consultas y solicitudes sobre tus datos, escribí a <a href={`mailto:${siteConfig.privacy.contactEmail}`} className={styles.PrivacyPolicy__link}>{siteConfig.privacy.contactEmail}</a>.</p>
      </header>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Cuenta e inicio de sesión con Google</h2>
        <p className={styles.PrivacyPolicy__text}>Al iniciar sesión con Google, recibimos el identificador de tu cuenta, tu nombre, tu correo electrónico y tu imagen de perfil cuando están disponibles. Usamos esos datos para reconocer tu cuenta, mostrar tu perfil y gestionar tu sesión en TuTribu. Google administra tu contraseña; TuTribu no la recibe.</p>
        <p className={styles.PrivacyPolicy__text}>Conservamos información de sesión y credenciales de autorización de Google en el servidor. Pueden utilizarse para mantener el acceso autorizado y actualizar la imagen de perfil. Cuando una acción sensible necesita confirmar tu cuenta, solicitamos a Google información sobre esa autenticación. No accedemos al contenido de tu correo de Gmail, documentos de Drive ni contactos de Google mediante este inicio de sesión.</p>
      </section>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Datos que compartís en TuTribu</h2>
        <p className={styles.PrivacyPolicy__text}>Tratamos los datos que ingresás en tu perfil y los contenidos que publicás o adjuntás, como mensajes, comentarios, archivos y actividades. También registramos pertenencia a tribus, roles, invitaciones, solicitudes de ingreso y acciones necesarias para administrar esos espacios.</p>
        <p className={styles.PrivacyPolicy__text}>Tu perfil y el contenido que compartís pueden ser vistos por las personas que tengan acceso al espacio correspondiente. Los responsables de cada tribu acceden a la información necesaria para gestionar sus integrantes, sus solicitudes y sus actividades, según los permisos del servicio. Antes de publicar, evitá incluir datos de otras personas sin su autorización.</p>
      </section>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Comprobación de contacto y mensajes</h2>
        <p className={styles.PrivacyPolicy__text}>Cuando una academia habilita la comprobación de contacto, utilizamos el correo o teléfono que proporcionás para gestionar esa comprobación y sus solicitudes de ingreso. Si pedís un código, el destino y los datos necesarios para enviarlo se transmiten al servicio de mensajería conectado por el líder, mediante el canal configurado, como correo, SMS o WhatsApp.</p>
        <p className={styles.PrivacyPolicy__text}>Los mensajes y las notificaciones se procesan con los proveedores que correspondan al canal habilitado. En WhatsApp también intervienen los servicios de Meta. Comprobar un contacto en una academia no cambia la contraseña ni los medios de recuperación de tu cuenta de Google, y no acredita pertenencia a un grupo externo.</p>
      </section>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Pagos y suscripciones</h2>
        <p className={styles.PrivacyPolicy__text}>Si usás una función de pago, los cobros se tramitan con el proveedor de pagos correspondiente. TuTribu conserva las referencias y los estados necesarios para relacionar una suscripción o un pago con el acceso al servicio. Los datos de pago que ingresás en la plataforma del proveedor son tratados por ese proveedor.</p>
      </section>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Almacenamiento y servicios externos</h2>
        <p className={styles.PrivacyPolicy__text}>TuTribu utiliza servicios de infraestructura para alojar la aplicación, almacenar datos y archivos y prestar sus funciones. Según la función utilizada, intervienen Google para autenticación, Neon para la base de datos, Cloudflare para archivos e infraestructura, servicios de alojamiento, el proveedor de pagos y el proveedor de mensajería conectado por la tribu.</p>
        <p className={styles.PrivacyPolicy__text}>Estos servicios pueden procesar información en ubicaciones diferentes de tu país. La información que reciben depende de la función que utilizás y se limita a lo necesario para prestarla. Sus propios servicios también están sujetos a sus políticas de privacidad.</p>
      </section>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Cookies, preferencias y soporte</h2>
        <p className={styles.PrivacyPolicy__text}>Utilizamos cookies para la sesión y preferencias del servicio. El navegador también puede guardar preferencias, como el tema visual o el estado de la navegación. Estos datos permiten conservar el acceso y las opciones que elegís.</p>
        <p className={styles.PrivacyPolicy__text}>Si enviás un reporte desde las herramientas de soporte, podemos recibir su texto, datos técnicos y la captura que incluyas para investigar el problema. No agregues contraseñas, claves, códigos de acceso ni información privada de otras personas. Los reportes pueden procesarse con las herramientas de soporte y seguimiento de incidencias del servicio.</p>
      </section>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Seguridad y conservación</h2>
        <p className={styles.PrivacyPolicy__text}>Aplicamos controles de acceso según la cuenta, la tribu y el rol. Las credenciales de integración se mantienen en el servidor. Registramos información técnica y de operaciones para detectar fallos, investigar incidentes y conservar resultados de acciones realizadas.</p>
        <p className={styles.PrivacyPolicy__text}>Conservamos datos mientras sean necesarios para prestar el servicio, administrar los accesos, resolver solicitudes y cumplir las obligaciones aplicables. Una solicitud de eliminación puede requerir conservar referencias mínimas de operaciones, pagos o seguridad. No implica retirar información que otras personas hayan conservado fuera de TuTribu ni eliminar automáticamente datos de un proveedor externo.</p>
      </section>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Consultas, corrección y eliminación</h2>
        <p className={styles.PrivacyPolicy__text}>Podés solicitar información sobre tus datos, su corrección o su eliminación al correo de contacto indicado en esta página. Para proteger tu cuenta, podemos necesitar comprobar que la solicitud provenga de su titular antes de realizar un cambio.</p>
        <p className={styles.PrivacyPolicy__text}>Podés revisar y retirar el acceso de TuTribu desde las opciones de aplicaciones conectadas de tu cuenta de Google. Retirar ese acceso no elimina por sí mismo los datos ya almacenados en TuTribu; para pedir su eliminación, contactá al responsable del servicio.</p>
      </section>

      <section className={styles.PrivacyPolicy__section}>
        <h2 className={styles.PrivacyPolicy__heading}>Cambios en esta información</h2>
        <p className={styles.PrivacyPolicy__text}>Esta página se actualizará cuando cambien las funciones o la forma de tratar los datos. Podés consultarla desde la página principal sin iniciar sesión y comunicarte con el responsable si necesitás aclarar alguno de sus puntos.</p>
      </section>
    </main>
  );
}
